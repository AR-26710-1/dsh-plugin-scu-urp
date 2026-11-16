#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
四川大学宿舍电费查询工具 (正式稳定版)
- 支持账号密码登录 (国密 SM2 加密 + 本地 ddddocr 自动秒级识别图形验证码)
- 优化终端密码输入 (带星号实时回显与退格修正，完美兼容各类远程连接终端)
- 自动流转竹云 IDaaS CAS 单点登录并回跳电费系统
- 自动提取绑定宿舍身份信息，同时查询【空调电费】与【照明电费】
- 支持【一键交互式切换宿舍房间】(支持跨校区/跨楼栋查询任意寝室电费)
- 自动持久化 Session Cookie 与用户信息，后续运行直接秒级免登录查询
"""

import os
import sys
import time
import json
import re
import base64
import urllib.parse
from typing import Dict, Any, Optional, Tuple, List

import requests
from gmssl import sm2
import ddddocr

# 常量配置
CACHE_FILE = "ele_session.json"
BASE_PAYAPP = "https://payapp.scu.edu.cn"
BASE_IDSCU = "https://id.scu.edu.cn"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# 初始化 OCR 引擎
ocr_engine = ddddocr.DdddOcr(show_ad=False)


def get_masked_password(prompt: str = "请输入统一认证密码: ") -> str:
    """
    带有星号回显的密码输入函数，支持退格修改，彻底解决远程连接下无回显造成的误解
    """
    sys.stdout.write(prompt)
    sys.stdout.flush()

    try:
        import msvcrt
        pwd_chars = []
        while True:
            ch = msvcrt.getch()
            # 回车确认
            if ch in (b"\r", b"\n"):
                sys.stdout.write("\n")
                sys.stdout.flush()
                break
            # 退格键 (Backspace)
            elif ch == b"\x08":
                if pwd_chars:
                    pwd_chars.pop()
                    sys.stdout.write("\b \b")
                    sys.stdout.flush()
            # Ctrl+C 中断
            elif ch == b"\x03":
                sys.stdout.write("\n")
                raise KeyboardInterrupt
            # 忽略特殊功能键
            elif ch in (b"\x00", b"\xe0"):
                msvcrt.getch()
            else:
                try:
                    char_str = ch.decode("utf-8", errors="ignore")
                    if char_str:
                        pwd_chars.append(char_str)
                        sys.stdout.write("*")
                        sys.stdout.flush()
                except Exception:
                    pass
        pwd = "".join(pwd_chars).strip()
        if pwd:
            return pwd
    except Exception:
        pass

    # 降级方案
    return input().strip()


class SCUElectricityClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": UA})
        self.sp_code = ""
        self.application_key = "scdxplugin_cas_apereo17"
        self.cus_no = ""
        self.cus_name = ""
        self.user_type = "1"

    def load_cache(self) -> bool:
        """尝试读取并恢复缓存的会话 Cookie 与用户信息"""
        if not os.path.exists(CACHE_FILE):
            return False
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)

            if "cookies" in data:
                cookies_dict = data.get("cookies", {})
                self.cus_no = data.get("cusNo", "")
                self.cus_name = data.get("cusName", "")
                self.user_type = data.get("type", "1")
            else:
                cookies_dict = data
                self.cus_no = ""
                self.cus_name = ""
                self.user_type = "1"

            self.session.cookies.update(cookies_dict)
            return bool(cookies_dict)
        except Exception:
            return False

    def save_cache(self):
        """保存当前会话 Cookie 与用户信息到本地"""
        try:
            cookies_dict = requests.utils.dict_from_cookiejar(self.session.cookies)
            cache_data = {
                "cookies": cookies_dict,
                "cusNo": self.cus_no,
                "cusName": self.cus_name,
                "type": self.user_type
            }
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cache_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[!] 保存缓存失败: {e}")

    def prepare_sso_entry(self) -> Tuple[str, str]:
        """
        触发电费入口重定向链，捕获微服务平台和统一认证 CAS 入口，提取 sp_code 与 application_key
        """
        print("[*] 正在连接四川大学电费认证入口...")
        entry_url = f"{BASE_PAYAPP}/eleFees/oauth/airWarrant"
        r = self.session.get(entry_url, allow_redirects=True, timeout=15)

        sp_code = ""
        app_key = "scdxplugin_cas_apereo17"

        m_go = re.search(r'var goUrl = "(.*?)";', r.text)
        if m_go:
            go_url = m_go.group(1)
            if "sp_code=" in go_url:
                sp_m = re.search(r'sp_code=([^&"\']+)', go_url)
                if sp_m:
                    sp_code = sp_m.group(1)

        m_app = re.search(r'application_key=([a-zA-Z0-9_-]+)', r.text)
        if m_app:
            app_key = m_app.group(1)

        self.sp_code = sp_code
        self.application_key = app_key
        return sp_code, app_key

    def sm2_encrypt_password(self, public_key_b64: str, password: str) -> str:
        """
        按照竹云 IDaaS 的国密 SM2 标准加密密码 (C1C2C3 模式，拼接 04 前缀并转 Base64)
        """
        pub_bytes = base64.b64decode(public_key_b64)
        pub_hex = pub_bytes.hex()

        crypt = sm2.CryptSM2(public_key=pub_hex, private_key=None, mode=0)
        enc = crypt.encrypt(password.encode("utf-8"))

        if not enc.startswith(b"\x04"):
            enc = b"\x04" + enc

        return base64.b64encode(enc).decode("ascii")

    def login_by_password(self, username: str, password: str, max_retries: int = 4) -> str:
        """
        统一认证：账号密码登录 (国密 SM2 加密 + ddddocr 自动验证码识别)
        """
        print(f"[*] 正在获取统一认证动态 SM2 加密密钥...")
        sm2_url = f"{BASE_IDSCU}/api/public/bff/v1.2/sm2_key"
        headers = {
            "Referer": f"{BASE_IDSCU}/frontend/login",
            "Origin": BASE_IDSCU,
            "Content-Type": "application/json",
            "User-Agent": UA
        }
        r_key = self.session.post(sm2_url, headers=headers, json={}, timeout=10)
        key_data = r_key.json()
        if not key_data.get("success"):
            raise RuntimeError(f"获取 SM2 密钥失败: {key_data}")

        pub_key = key_data["data"]["publicKey"]
        sm2_code = key_data["data"]["code"]
        encrypted_pwd = self.sm2_encrypt_password(pub_key, password)

        for attempt in range(max_retries):
            # 1. 获取图形验证码
            cap_url = f"{BASE_IDSCU}/api/public/bff/v1.2/one_time_login/captcha?enterpriseId=scdx"
            r_cap = self.session.get(cap_url, headers=headers, timeout=10)
            cap_json = r_cap.json()
            cap_code = cap_json.get("data", {}).get("code", "")
            cap_b64 = cap_json.get("data", {}).get("captcha", "")

            # 2. 自动 OCR 识别
            cap_text = ""
            try:
                cap_text = ocr_engine.classification(base64.b64decode(cap_b64))
                print(f"[*] 自动识别图形验证码: {cap_text} (尝试 {attempt + 1}/{max_retries})")
            except Exception as e:
                print(f"[!] 验证码识别模块异常: {e}")
                cap_text = input("请手动输入验证码: ").strip()

            # 3. 提交 rest_token 登录
            login_payload = {
                "client_id": "1371cbeda563697537f28d99b4744a973uDKtgYqL5B",
                "grant_type": "password",
                "scope": "read",
                "username": username.strip(),
                "password": encrypted_pwd,
                "_enterprise_id": "scdx",
                "sm2_code": sm2_code,
                "cap_code": cap_code,
                "cap_text": cap_text,
                "deviceId": ""
            }

            login_url = f"{BASE_IDSCU}/api/public/bff/v1.2/rest_token"
            r_login = self.session.post(login_url, headers=headers, json=login_payload, timeout=12)
            login_res = r_login.json()

            code = str(login_res.get("code", ""))
            if code == "200":
                access_token = login_res.get("data", {}).get("access_token")
                if not access_token:
                    raise RuntimeError("登录成功但未返回 access_token")
                print("[+] 统一身份认证登录成功！")
                return access_token

            # 处理登录失败原因
            msg = login_res.get("message", "")
            err_desc = login_res.get("data", {}).get("error_description", "")
            if "invalid_captcha" in msg or "invalid_captcha" in err_desc:
                print("[-] 验证码自动识别偏差，正在自动重试刷新...")
                time.sleep(0.5)
                continue
            elif "invalid_password" in err_desc or "Bad credentials" in msg:
                raise RuntimeError("账号或密码错误，请核对学号与统一身份认证密码！")
            else:
                raise RuntimeError(f"统一认证登录失败: {msg or err_desc} (状态码: {code})")

        raise RuntimeError("验证码连续识别未通过，请稍后重试。")

    def _extract_user_credentials(self, html_text: str):
        """从页面 HTML 中提取 cusNo, cusName, type"""
        m_no = re.search(r"var cusNo\s*=\s*'([^']*)'", html_text) or re.search(r'id="cusNo"[^>]*value="([^"]*)"', html_text)
        m_name = re.search(r"var cusName\s*=\s*'([^']*)'", html_text) or re.search(r'id="cusName"[^>]*value="([^"]*)"', html_text)
        m_type = re.search(r"var type\s*=\s*'([^']*)'", html_text) or re.search(r'id="type"[^>]*value="([^"]*)"', html_text)

        if m_no and m_no.group(1):
            self.cus_no = m_no.group(1)
        if m_name and m_name.group(1):
            self.cus_name = m_name.group(1)
        if m_type and m_type.group(1):
            self.user_type = m_type.group(1)

    def exchange_sp_session(self, access_token: str):
        """
        利用 access_token 通过 sp_logged 重定向链回到电费系统，写入登录 Session
        """
        print("[*] 正在完成 CAS 单点登录票据兑换与会话回调...")
        sp_url = (
            f"{BASE_IDSCU}/api/bff/v1.2/commons/sp_logged"
            f"?sp_code={urllib.parse.quote(self.sp_code)}"
            f"&application_key={self.application_key}"
            f"&access_token={access_token}"
        )
        r = self.session.get(sp_url, allow_redirects=True, timeout=15)
        self._extract_user_credentials(r.text)

        # 确保通过 airWarrant 触发一次完整回调提取 cusNo 与 cusName
        if not self.cus_no:
            r_w = self.session.get(f"{BASE_PAYAPP}/eleFees/oauth/airWarrant", allow_redirects=True, timeout=15)
            self._extract_user_credentials(r_w.text)

        self.save_cache()
        print(f"[+] 会话流转完毕，绑定用户: {self.cus_name} (学号: {self.cus_no})")

    def query_electricity(self) -> Dict[str, Any]:
        """
        同时拉取当前宿舍的【空调电费】与【照明电费】
        """
        if not self.cus_no:
            r_w = self.session.get(f"{BASE_PAYAPP}/eleFees/oauth/airWarrant", allow_redirects=True, timeout=15)
            self._extract_user_credentials(r_w.text)
            self.save_cache()

        if not self.cus_no:
            raise PermissionError("无法获取电费系统绑定身份，会话可能已过期，请重新登录")

        query_url = f"{BASE_PAYAPP}/eleFees/electric/queryRoomInfo"
        headers = {"Content-Type": "application/json"}

        # 1. 查询空调电费 (type=1)
        r_air = self.session.post(query_url, headers=headers, json={"cusNo": self.cus_no, "type": 1, "cusName": self.cus_name}, timeout=10)
        data_air_resp = r_air.json()
        data_air = data_air_resp.get("data") or {}

        # 2. 查询照明电费 (type=2)
        r_light = self.session.post(query_url, headers=headers, json={"cusNo": self.cus_no, "type": 2, "cusName": self.cus_name}, timeout=10)
        data_light_resp = r_light.json()
        data_light = data_light_resp.get("data") or {}

        if not data_air and not data_light:
            err_msg = data_air_resp.get("respDesc") or data_light_resp.get("respDesc") or "查询失败"
            return {
                "success": False,
                "msg": err_msg,
                "cusNo": self.cus_no,
                "cusName": self.cus_name
            }

        base_info = data_air if data_air else data_light
        return {
            "success": True,
            "schoolName": base_info.get("schoolName", ""),
            "regName": base_info.get("regName", ""),
            "unitName": base_info.get("unitName", ""),
            "roomNo": base_info.get("roomNo", ""),
            "cusNo": self.cus_no,
            "cusName": self.cus_name,
            "price": base_info.get("price", "0.55"),
            "airBalance": data_air.get("balance", "暂无数据"),
            "lightBalance": data_light.get("balance", "暂无数据")
        }

    # =========================================================================
    # 切换宿舍房间业务逻辑
    # =========================================================================

    def get_campuses(self) -> List[Dict[str, str]]:
        """获取校区列表 (望江、华西、江安)"""
        url = f"{BASE_PAYAPP}/eleFees/electric/getCampus"
        r = self.session.post(url, json={}, timeout=10)
        return r.json().get("data", {}).get("datas", [])

    def get_buildings(self, school_code: str) -> List[Dict[str, str]]:
        """获取指定校区的宿舍楼栋列表"""
        url = f"{BASE_PAYAPP}/eleFees/electric/getArchitecture"
        r = self.session.post(url, json={"schoolCode": school_code}, timeout=10)
        return r.json().get("data", {}).get("datas", [])

    def get_units(self, school_code: str, reg_code: str) -> List[Dict[str, str]]:
        """获取指定楼栋的单元列表 (若无单元则返回空列表)"""
        url = f"{BASE_PAYAPP}/eleFees/electric/getUnit"
        r = self.session.post(url, json={"schoolCode": school_code, "regCode": reg_code}, timeout=10)
        return r.json().get("data", {}).get("datas", [])

    def switch_room(self, school_code: str, reg_code: str, unit_code: str, room_no: str) -> Tuple[bool, str]:
        """
        调用 verificationRoom 切换/绑定到指定房间
        """
        url = f"{BASE_PAYAPP}/eleFees/electric/verificationRoom"
        payload = {
            "cusNo": self.cus_no,
            "type": 1,
            "cusName": self.cus_name,
            "schoolCode": school_code,
            "regCode": reg_code,
            "unitCode": unit_code,
            "roomNo": room_no.strip()
        }
        r = self.session.post(url, json=payload, timeout=10)
        res = r.json()
        if res.get("respCode") == "00":
            data = res.get("data") or {}
            if data.get("status"):
                return True, "切换房间成功！"
            return False, data.get("desc", "房间校验未通过，请检查房间号")
        return False, res.get("respDesc", "切换失败")

    def switch_room_interactive(self) -> bool:
        """
        交互式切换房间向导：支持校区选择、楼栋模糊搜索、单元选择及房间输入
        """
        print("\n================== 切换宿舍房间向导 ==================")
        
        # 1. 选择校区
        campuses = self.get_campuses()
        if not campuses:
            print("[-] 获取校区列表失败，请检查网络或会话。")
            return False

        print("可选校区:")
        for idx, c in enumerate(campuses):
            print(f"  [{idx + 1}] {c['name']}")
        
        while True:
            c_input = input("请选择校区序号 [1-{}]: ".format(len(campuses))).strip()
            if c_input.isdigit() and 1 <= int(c_input) <= len(campuses):
                selected_campus = campuses[int(c_input) - 1]
                break
            print("[-] 输入无效，请重新输入。")

        school_code = selected_campus["code"]
        print(f"[*] 已选择校区: {selected_campus['name']}")

        # 2. 选择楼栋
        print(f"[*] 正在获取【{selected_campus['name']}】的宿舍楼栋列表...")
        buildings = self.get_buildings(school_code)
        if not buildings:
            print("[-] 未能获取该校区的楼栋列表。")
            return False

        print("\n可选楼栋列表:")
        # 4 列紧凑排版展示
        line_buf = []
        for idx, b in enumerate(buildings):
            item_str = f"[{idx + 1}] {b['name']}".ljust(16)
            line_buf.append(item_str)
            if len(line_buf) == 4:
                print("  " + "".join(line_buf))
                line_buf = []
        if line_buf:
            print("  " + "".join(line_buf))

        selected_building = None
        while True:
            b_input = input("\n请输入楼栋序号 (如 15) 或楼栋名称关键字 (如 西园15舍): ").strip()
            if not b_input:
                continue

            # 优先匹配纯数字序号
            if b_input.isdigit() and 1 <= int(b_input) <= len(buildings):
                selected_building = buildings[int(b_input) - 1]
                break

            # 模糊匹配名称
            matched = [b for b in buildings if b_input in b["name"]]
            if len(matched) == 1:
                selected_building = matched[0]
                break
            elif len(matched) > 1:
                print("  匹配到多个楼栋，请进一步精确输入:")
                for m_idx, m_b in enumerate(matched):
                    print(f"    [{m_idx + 1}] {m_b['name']}")
                sub_in = input("  请选择匹配项序号: ").strip()
                if sub_in.isdigit() and 1 <= int(sub_in) <= len(matched):
                    selected_building = matched[int(sub_in) - 1]
                    break
            else:
                print("[-] 未匹配到对应楼栋，请重新输入。")

        reg_code = selected_building["code"]
        print(f"[*] 已选择楼栋: {selected_building['name']}")

        # 3. 选择单元号 (如果有)
        print(f"[*] 正在检测【{selected_building['name']}】单元分布...")
        units = self.get_units(school_code, reg_code)
        unit_code = ""
        if units:
            print("可选单元:")
            for idx, u in enumerate(units):
                print(f"  [{idx + 1}] {u['name']}", end="  ")
                if (idx + 1) % 5 == 0:
                    print("")
            print("")
            while True:
                u_input = input("请选择单元序号 [1-{}]: ".format(len(units))).strip()
                if u_input.isdigit() and 1 <= int(u_input) <= len(units):
                    selected_unit = units[int(u_input) - 1]
                    unit_code = selected_unit["code"]
                    print(f"[*] 已选择单元: {selected_unit['name']}")
                    break
                print("[-] 输入无效，请重新输入。")
        else:
            print("[*] 该楼栋无独立单元划分，自动跳过。")

        # 4. 输入房间号
        print("\n房间号提示: 江安西园、望江东园、华西带子房间的大寝室，末尾加大写字母 (如 101c, 203a, 302)")
        room_no = input("请输入房间号: ").strip()

        # 5. 执行切换校验
        print(f"[*] 正在向学校系统提交切换房间请求...")
        ok, msg = self.switch_room(school_code, reg_code, unit_code, room_no)
        if ok:
            print(f"\n[+] 恭喜！已成功切换至: {selected_campus['name']} {selected_building['name']} {room_no}！")
            return True
        else:
            print(f"\n[-] 切换失败: {msg}")
            return False


def main():
    print("==================================================")
    print("      四川大学宿舍电费自动化查询工具 (正式版)")
    print("==================================================")

    client = SCUElectricityClient()

    # 1. 优先尝试本地缓存会话秒查
    logged_in = False
    if client.load_cache():
        print("[*] 发现本地缓存会话，正在连接电费系统...")
        try:
            res = client.query_electricity()
            if res.get("success"):
                logged_in = True
                display_result(res)
            else:
                print(f"[!] 缓存查询返回: {res.get('msg')}，正在尝试重新登录...")
        except PermissionError:
            print("[-] 本地会话已过期，需要重新登录认证。")
        except Exception as e:
            print(f"[!] 缓存会话读取异常: {e}")

    # 2. 如果未登录，执行登录流程
    if not logged_in:
        try:
            client.prepare_sso_entry()
        except Exception as e:
            print(f"[-] 初始化认证入口失败: {e}")
            return

        print("\n--- 四川大学统一身份认证 ---")
        username = input("请输入学号: ").strip()
        print("[提示] 正在输入密码（支持退格修改，输入完毕按 Enter 确认）:")
        password = get_masked_password("统一认证密码: ")

        try:
            token = client.login_by_password(username, password)
        except Exception as e:
            print(f"\n[-] 统一身份认证登录失败: {e}")
            return

        try:
            client.exchange_sp_session(token)
        except Exception as e:
            print(f"[-] 单点登录会话流转失败: {e}")
            return

        print("\n[*] 正在拉取当前宿舍电费信息...")
        try:
            res = client.query_electricity()
            if res.get("success"):
                display_result(res)
            else:
                print(f"\n[-] 查询电费失败: {res.get('msg')}")
        except Exception as e:
            print(f"[-] 查询电费出错: {e}")

    # 3. 交互式菜单循环 (支持切换房间、刷新、退出)
    while True:
        print("\n--------------------------------------------------")
        print("  [S] 切换/查询其他宿舍房间")
        print("  [R] 刷新当前宿舍电费")
        print("  [Q] 退出程序")
        print("--------------------------------------------------")
        action = input("请选择操作 [S/R/Q，直接回车退出]: ").strip().lower()

        if action == "s":
            if client.switch_room_interactive():
                print("\n[*] 正在查询切换后的新宿舍电费...")
                new_res = client.query_electricity()
                if new_res.get("success"):
                    display_result(new_res)
                else:
                    print(f"[-] 拉取新房间电费失败: {new_res.get('msg')}")
        elif action == "r":
            print("\n[*] 正在刷新最新电费数据...")
            ref_res = client.query_electricity()
            if ref_res.get("success"):
                display_result(ref_res)
            else:
                print(f"[-] 刷新失败: {ref_res.get('msg')}")
        else:
            print("\n感谢使用，祝生活愉快！再见。")
            break


def display_result(res: Dict[str, Any]):
    print("\n================== 宿舍电费详情 ==================")
    print(f"  校区:          {res.get('schoolName')}")
    print(f"  宿舍楼栋:      {res.get('regName')}")
    if res.get("unitName"):
        print(f"  单元号:        {res.get('unitName')}")
    print(f"  房间号:        {res.get('roomNo')}")
    print(f"  绑定学号:      {res.get('cusNo')} ({res.get('cusName')})")
    print(f"  电费单价:      {res.get('price')} 元/度")
    print("  ------------------------------------------------")
    print(f"  [★] 空调剩余电量:  {res.get('airBalance')} 度")
    print(f"  [★] 照明剩余电量:  {res.get('lightBalance')} 度")
    print("==================================================")
    print("[+] 查询完毕！会话已缓存，下次可直接秒查。")


if __name__ == "__main__":
    main()
