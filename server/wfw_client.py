"""
四川大学微服务平台客户端 (WFW Micro-Service Client)
对接四川大学微服务综合平台 (https://wfw.scu.edu.cn) 核心业务：
1. 校园一卡通服务 (Campus Card)：实时余额、消费明细流水、消费统计、卡片状态
2. 校园网在线终端管理 (Network Clients)：在线设备列表查看、多终端状态监控、远程设备一键踢下线
3. 用户全量画像 (User Profile)：学生身份、学院、学号、联系方式等

会话机制：
与宿舍电费/缴费中心 (payapp.scu.edu.cn) 共享 CAS 统一身份认证 Ticket (scdxplugin_cas_apereo17)。
支持一次登录全链路自动复用，或在需要时通过统一认证凭据透明静默重连。
"""
import re
import time
import json
import datetime
from typing import Dict, Any, List, Optional
import requests

from crypto_store import CredentialStore
from auth_hub import auth_hub


class SCUMicroServiceClient:
    BASE_URL = "https://wfw.scu.edu.cn"
    UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    def __init__(self):
        self.session: Optional[requests.Session] = None
        self.cred_store = CredentialStore()
        self.last_card_cache: Optional[Dict[str, Any]] = None
        self.last_card_time: float = 0
        self.last_network_cache: Optional[Dict[str, Any]] = None
        self.last_network_time: float = 0

    def update_session(self, session: requests.Session):
        """外部注入已认证的 requests.Session"""
        self.session = session
        self.session.headers.update({
            "User-Agent": self.UA,
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{self.BASE_URL}/site/polymerization/index"
        })

    def _ensure_session(self) -> requests.Session:
        """确保微服务会话有效，若失效则尝试利用本地凭据静默重新认证"""
        if self.session is not None:
            # 简单抽样验证会话活性
            try:
                r = self.session.get(f"{self.BASE_URL}/uc/wap/user/get-info", timeout=5)
                if r.status_code == 200 and r.json().get("e") == 0:
                    return self.session
            except Exception:
                pass

        # 尝试使用本地凭据静默重新认证
        creds = self.cred_store.load_credentials()
        if creds and creds.get("username") and creds.get("password"):
            try:
                token = auth_hub.login_by_password(creds["username"], creds["password"])
                ok_ele, _, e_data = auth_hub.activate_electricity_session(token)
                if ok_ele and "session" in e_data:
                    self.update_session(e_data["session"])
                    return self.session
            except Exception as e:
                print(f"[WfwClient] 静默重连微服务失败: {e}")

        # 若此前有 session 仍尽量返回
        if self.session is not None:
            return self.session

        # 构造空 session 兜底
        s = requests.Session()
        s.trust_env = False
        s.headers.update({"User-Agent": self.UA, "X-Requested-With": "XMLHttpRequest"})
        self.session = s
        return self.session

    def get_user_profile(self) -> Dict[str, Any]:
        """获取当前学生微服务基础画像"""
        s = self._ensure_session()
        try:
            r = s.get(f"{self.BASE_URL}/uc/wap/user/get-info", timeout=8)
            res = r.json()
            if res.get("e") == 0:
                base = res.get("d", {}).get("base", {})
                return {
                    "success": True,
                    "uid": base.get("uid"),
                    "realname": base.get("realname", ""),
                    "sex": base.get("sex", ""),
                    "mobile": base.get("mobile", ""),
                    "email": base.get("email", ""),
                    "roleNumber": base.get("role", {}).get("number", ""),
                    "identity": base.get("role", {}).get("identity", ""),
                    "departments": list(base.get("departs", {}).values())
                }
        except Exception as e:
            print(f"[WfwClient] 获取用户画像异常: {e}")
        return {"success": False}

    def _clean_merchant_name(self, raw_toname: str) -> str:
        """清洗一卡通商户档口名称，去除层级冗余斜杠"""
        if not raw_toname:
            return "校园餐饮/商户"
        parts = [p.strip() for p in raw_toname.split("\\") if p.strip()]
        if not parts:
            return raw_toname
        # 若以“饮食中心”开头，略去第一级
        if parts[0] == "饮食中心" and len(parts) > 1:
            parts = parts[1:]
        # 去除连续重复（如 江安东园三食堂 \ 江安三食堂一楼）
        cleaned = " · ".join(parts)
        return cleaned

    def get_card_status(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        获取校园一卡通核心状态：
        - 实时物理卡余额 (balance)
        - 今日总支出 (todaySpent)
        - 近 30 天消费笔数与汇总
        - 交易流水记录列表 (recentRecords)
        """
        now = time.time()
        # 缓存 300 秒（5分钟），若未强制刷新且在有效期内则直接复用
        if not force_refresh and self.last_card_cache and (now - self.last_card_time < 300):
            return self.last_card_cache

        s = self._ensure_session()
        try:
            r = s.get(f"{self.BASE_URL}/cardhis/wap/default/get-index", timeout=12)
            res = r.json()
            if res.get("e") != 0:
                error_msg = res.get("m", "拉取校园卡信息失败")
                return {"success": False, "message": error_msg}

            data = res.get("d", {})
            sdate = data.get("sdate", "")
            edate = data.get("edate", "")
            raw_list = data.get("list", {})

            today_str = datetime.date.today().strftime("%Y-%m-%d")
            records: List[Dict[str, Any]] = []
            today_spent = 0.0
            total_spent = 0.0
            total_recharge = 0.0
            current_balance = "0.00"
            has_found_balance = False

            # raw_list 是按日期降序的字典 {'2026-11-16': [...], '2026-11-14': [...]}
            if isinstance(raw_list, dict):
                # 按日期倒序排列
                sorted_dates = sorted(raw_list.keys(), reverse=True)
                for date_key in sorted_dates:
                    day_items = raw_list.get(date_key, [])
                    if not isinstance(day_items, list):
                        continue
                    for item in day_items:
                        xfje = float(item.get("xfje", 0))
                        syje = str(item.get("syje", "0.00"))
                        ttype = item.get("type", "消费")
                        time_str = item.get("time", "")
                        merchant = self._clean_merchant_name(item.get("toname", ""))

                        # 记录最新的一笔余额即为物理卡当前实时余额
                        if not has_found_balance and syje:
                            current_balance = syje
                            has_found_balance = True

                        if date_key == today_str and ("消费" in ttype or xfje > 0):
                            today_spent += xfje

                        if "消费" in ttype or (xfje > 0 and "充值" not in ttype):
                            total_spent += xfje
                        elif "充值" in ttype or "补助" in ttype:
                            total_recharge += xfje

                        full_dt = f"{date_key} {time_str}".strip()
                        records.append({
                            "id": f"{item.get('jdate', '')}_{time_str}_{xfje}",
                            "date": date_key,
                            "time": time_str,
                            "datetime": full_dt,
                            "merchant": merchant,
                            "rawToname": item.get("toname", ""),
                            "amount": xfje,
                            "balance": syje,
                            "type": ttype,
                            "timestamp": item.get("jdate", 0)
                        })

            # 组装返回结果
            result = {
                "success": True,
                "balance": current_balance,
                "todaySpent": round(today_spent, 2),
                "totalSpent": round(total_spent, 2),
                "totalRecharge": round(total_recharge, 2),
                "recordCount": len(records),
                "dateRange": f"{sdate} ~ {edate}" if sdate else "",
                "records": records[:50],  # 取最近 50 笔明细
                "cardStatus": "正常",
                "lastUpdated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }

            self.last_card_cache = result
            self.last_card_time = now
            return result

        except Exception as e:
            print(f"[WfwClient] 查询一卡通异常: {e}")
            if self.last_card_cache:
                return self.last_card_cache
            return {"success": False, "message": f"连接校园卡微服务超时或异常: {str(e)}"}

    def _guess_device_type(self, mac: str) -> Dict[str, str]:
        """根据 MAC 地址前缀特征推测设备类型与图标"""
        clean_mac = mac.replace(":", "").replace("-", "").upper()
        # 常见厂商 OUI 特征
        # Apple (常见: 1C:83:41, F0:18:98, A4:83:E7, 8C:85:90, etc.)
        # Intel / Lenovo / Xiaomi / Huawei
        device_label = "终端设备"
        icon = "monitor"
        
        # 简单根据常见分配及首字节推测移动端或电脑
        if clean_mac.startswith(("1C8341", "ACDE48", "F01898", "409C28", "8C8590", "A483E7")):
            device_label = "Apple 设备 (iPhone / Mac)"
            icon = "smartphone"
        elif clean_mac.startswith(("FE05A9", "B42E99", "D8F883", "A0C589")):
            device_label = "移动终端 / 笔记本"
            icon = "laptop"
        elif clean_mac.startswith(("00E04C", "001A79", "E0D55E")):
            device_label = "Realtek 网卡设备"
            icon = "monitor"
        else:
            device_label = "校园网接入终端"
            icon = "hard-drive"

        return {"label": device_label, "icon": icon}

    def get_network_status(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        获取校园网在线设备列表与状态：
        - 当前在线设备数组 (devices)
        - 在线台数 (deviceCount)
        - 最大允许在线数量 (maxDevices, 川大通常为 3 台)
        - 具备远程踢下线权限 (canOffline)
        """
        now = time.time()
        if not force_refresh and self.last_network_cache and (now - self.last_network_time < 120):
            return self.last_network_cache

        s = self._ensure_session()
        try:
            r = s.get(f"{self.BASE_URL}/netclient/wap/default/get-index", timeout=10)
            res = r.json()
            if res.get("e") != 0:
                error_msg = res.get("m", "拉取校园网设备失败")
                return {"success": False, "message": error_msg}

            data = res.get("d", {})
            raw_list = data.get("list", [])
            can_offline = bool(data.get("offline", True))

            devices: List[Dict[str, Any]] = []
            for item in raw_list:
                dev_id = str(item.get("device_id", "")).upper()
                ip = item.get("ip", "")
                
                # 格式化 MAC 地址（每 2 位加冒号）
                formatted_mac = ":".join([dev_id[i:i+2] for i in range(0, len(dev_id), 2)]) if len(dev_id) == 12 else dev_id
                guess = self._guess_device_type(dev_id)

                devices.append({
                    "deviceId": dev_id,
                    "mac": formatted_mac,
                    "ip": ip,
                    "deviceType": guess["label"],
                    "icon": guess["icon"],
                    "status": "在线"
                })

            result = {
                "success": True,
                "devices": devices,
                "deviceCount": len(devices),
                "maxDevices": 3,
                "canOffline": can_offline,
                "lastUpdated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }

            self.last_network_cache = result
            self.last_network_time = now
            return result

        except Exception as e:
            print(f"[WfwClient] 查询校园网状态异常: {e}")
            if self.last_network_cache:
                return self.last_network_cache
            return {"success": False, "message": f"连接校园网微服务超时: {str(e)}"}

    def offline_device(self, device_id: str, ip: str = "") -> Dict[str, Any]:
        """
        强制将指定在线终端踢下线
        """
        device_id = device_id.replace(":", "").replace("-", "").upper().strip()
        s = self._ensure_session()
        try:
            # 兼容表单和 JSON 两种提交方式
            payload = {"device_id": device_id, "ip": ip.strip()}
            r = s.post(f"{self.BASE_URL}/netclient/wap/default/offline", data=payload, timeout=10)
            res = r.json()
            
            # 若第一种方式提示错误，尝试以 json 发送
            if res.get("e") != 0:
                r = s.post(f"{self.BASE_URL}/netclient/wap/default/offline", json=payload, timeout=10)
                res = r.json()

            if res.get("e") == 0:
                # 下线成功后使本地缓存失效
                self.last_network_cache = None
                return {"success": True, "message": "终端设备已成功强制下线！已释放连接名额"}
            else:
                return {"success": False, "message": res.get("m", "下线操作失败")}

        except Exception as e:
            print(f"[WfwClient] 终端下线异常: {e}")
            return {"success": False, "message": f"下线请求失败: {str(e)}"}


# 全局单例
wfw_client = SCUMicroServiceClient()
