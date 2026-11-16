"""
四川大学竹云 IDaaS 统一身份认证中枢 (Auth Hub)
统一调度四川大学综合教务系统 (URP) 与宿舍电费系统 (SCU Electricity) 的统一身份认证。

核心能力：
1. 统一身份认证密码登录 (国密 SM2 非对称加密 + 本地 ddddocr 自动秒级识别验证码)
2. 统一身份认证扫码登录 (竹云 IDaaS 动态二维码 + 微川大/智慧川大 APP 扫码)
3. 统一凭据派发 (Ticket Dispatching)：
   - 教务处会话激活 (application_key=scdxplugin_jwt23)
   - 电费系统会话激活 (application_key=scdxplugin_cas_apereo17)
4. 零二次登录：一次认证，教务与电费双系统同时就绪
"""
import os
import sys
import io
import time
import json
import re
import base64
import urllib.parse
from typing import Dict, Any, Optional, Tuple, List

import requests
from gmssl import sm2

try:
    import ddddocr
except ImportError:
    ddddocr = None


class SCUUnifiedAuthHub:
    BASE_IDSCU = "https://id.scu.edu.cn"
    BASE_PAYAPP = "https://payapp.scu.edu.cn"
    BASE_URP = "http://zhjw.scu.edu.cn"
    
    CLIENT_ID = "1371cbeda563697537f28d99b4744a973uDKtgYqL5B"
    ENTERPRISE_ID = "scdx"
    
    URP_APP_KEY = "scdxplugin_jwt23"
    ELE_APP_KEY = "scdxplugin_cas_apereo17"

    UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    def __init__(self):
        self._ocr_instance = None
        self._sso_sessions: Dict[str, Dict[str, Any]] = {}

    @property
    def ocr(self):
        """懒加载本地轻量 OCR 引擎并抑制标准输出污染"""
        if self._ocr_instance is None and ddddocr is not None:
            old_stdout = sys.stdout
            try:
                sys.stdout = io.StringIO()
                self._ocr_instance = ddddocr.DdddOcr(show_ad=False)
            finally:
                sys.stdout = old_stdout
        return self._ocr_instance

    def _create_session(self) -> requests.Session:
        s = requests.Session()
        s.trust_env = False  # 防止被全局代理劫持
        s.headers.update({
            "User-Agent": self.UA,
            "Referer": f"{self.BASE_IDSCU}/frontend/login",
            "Origin": self.BASE_IDSCU
        })
        return s

    def sm2_encrypt_password(self, public_key_b64: str, password: str) -> str:
        """
        竹云 IDaaS 国密 SM2 标准加密算法
        C1C2C3 模式 (mode=0)，拼接 04 非压缩前缀并转 Base64 字符串
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
        统一认证：账号密码登录 (国密 SM2 加密 + 本地 ddddocr 自动验证码识别)
        成功后返回竹云 IDaaS 的 access_token
        """
        s = self._create_session()
        
        # 1. 获取动态 SM2 公钥
        sm2_url = f"{self.BASE_IDSCU}/api/public/bff/v1.2/sm2_key"
        headers = {
            "Referer": f"{self.BASE_IDSCU}/frontend/login",
            "Origin": self.BASE_IDSCU,
            "Content-Type": "application/json"
        }
        r_key = s.post(sm2_url, headers=headers, json={}, timeout=10)
        key_data = r_key.json()
        if not key_data.get("success"):
            raise RuntimeError(f"获取统一认证 SM2 密钥失败: {key_data.get('message', '未知错误')}")

        pub_key = key_data["data"]["publicKey"]
        sm2_code = key_data["data"]["code"]
        encrypted_pwd = self.sm2_encrypt_password(pub_key, password)

        # 2. 带重试的自动识别验证码与登录提交
        for attempt in range(max_retries):
            # 获取图形验证码
            cap_url = f"{self.BASE_IDSCU}/api/public/bff/v1.2/one_time_login/captcha?enterpriseId={self.ENTERPRISE_ID}"
            r_cap = s.get(cap_url, headers=headers, timeout=10)
            cap_json = r_cap.json()
            cap_code = cap_json.get("data", {}).get("code", "")
            cap_b64 = cap_json.get("data", {}).get("captcha", "")

            cap_text = ""
            if self.ocr:
                try:
                    raw_text = self.ocr.classification(base64.b64decode(cap_b64))
                    cap_text = re.sub(r"[^a-zA-Z0-9]", "", raw_text)
                except Exception as e:
                    print(f"[AuthHub] 验证码自动识别异常: {e}")
            
            if not cap_text:
                cap_text = "0000"

            # 提交认证
            login_payload = {
                "client_id": self.CLIENT_ID,
                "grant_type": "password",
                "scope": "read",
                "username": username.strip(),
                "password": encrypted_pwd,
                "_enterprise_id": self.ENTERPRISE_ID,
                "sm2_code": sm2_code,
                "cap_code": cap_code,
                "cap_text": cap_text,
                "deviceId": ""
            }

            login_url = f"{self.BASE_IDSCU}/api/public/bff/v1.2/rest_token"
            r_login = s.post(login_url, headers=headers, json=login_payload, timeout=12)
            login_res = r_login.json()
            code = str(login_res.get("code", ""))

            if code == "200":
                access_token = login_res.get("data", {}).get("access_token")
                if not access_token:
                    raise RuntimeError("统一认证登录成功但未下发 access_token")
                return access_token

            # 处理失败分支
            msg = login_res.get("message", "")
            err_desc = login_res.get("data", {}).get("error_description", "")
            if "invalid_captcha" in msg or "invalid_captcha" in err_desc:
                # 验证码识别有偏差，自动重试
                time.sleep(0.3)
                continue
            elif "invalid_password" in err_desc or "Bad credentials" in msg:
                raise RuntimeError("学号或统一身份认证密码错误，请核对！")
            else:
                err_detail = err_desc or msg or "未知认证错误"
                raise RuntimeError(f"统一身份认证失败: {err_detail} (错误码: {code})")

        raise RuntimeError("验证码连续识别未通过，请稍后重试。")

    def start_qrcode_session(self) -> Dict[str, Any]:
        """
        初始化统一认证动态扫码会话 (支持微川大 / 智慧川大 APP 扫码)
        """
        s = self._create_session()

        # 请求 init_code 获取临时票据
        r_init = s.get(
            f"{self.BASE_IDSCU}/api/public/bff/v1.2/one_time_login/init_code?enterpriseId={self.ENTERPRISE_ID}",
            timeout=10
        )
        d_init = r_init.json()
        code = d_init.get("data", {}).get("code")
        if not code:
            raise RuntimeError("获取统一认证扫码临时标识失败")

        # 获取二维码图片
        r_img = s.get(
            f"{self.BASE_IDSCU}/api/public/bff/v1.2/one_time_login/show/{code}?enterpriseId={self.ENTERPRISE_ID}",
            timeout=10
        )
        qr_b64 = base64.b64encode(r_img.content).decode("ascii")

        self._sso_sessions[code] = {
            "session": s,
            "created_at": time.time()
        }

        return {
            "code": code,
            "qrcode": f"data:image/png;base64,{qr_b64}",
            "expiresIn": 180
        }

    def check_qrcode_status(self, code: str) -> Tuple[str, str, Optional[str]]:
        """
        轮询检测扫码确认状态
        返回: (status: WAITING/SUCCESS/EXPIRED/ERROR, message, access_token)
        """
        record = self._sso_sessions.get(code)
        if not record:
            return "EXPIRED", "二维码已失效，请重新生成", None

        if time.time() - record["created_at"] > 180:
            self._sso_sessions.pop(code, None)
            return "EXPIRED", "二维码已超时，请刷新重试", None

        s = record["session"]
        try:
            r = s.get(
                f"{self.BASE_IDSCU}/api/public/bff/v1.2/one_time_login/obtain_confirm_status/{code}?enterpriseId={self.ENTERPRISE_ID}",
                timeout=10
            )
            data = r.json()
            is_confirmed = data.get("data", {}).get("result", False)

            if not is_confirmed:
                return "WAITING", "等待手机端微川大或智慧川大扫码确认...", None

            # 扫码确认！调用 success 兑换 access_token
            r_succ = s.post(
                f"{self.BASE_IDSCU}/api/public/bff/v1.2/one_time_login/success/{code}",
                json={"code": code, "enterpriseId": self.ENTERPRISE_ID},
                timeout=10
            )
            token_data = r_succ.json()
            access_token = token_data.get("data", {}).get("access_token", "")
            if not access_token:
                return "ERROR", "扫码已确认但未换取到有效 access_token", None

            self._sso_sessions.pop(code, None)
            return "SUCCESS", "统一身份认证扫码成功！", access_token
        except Exception as e:
            return "ERROR", f"扫码状态查询异常: {str(e)}", None

    def activate_urp_session(self, access_token: str) -> Tuple[bool, str, Dict[str, Any]]:
        """
        通过统一认证 access_token 激活教务处 (URP) 会话
        返回: (success, message, {"session": requests.Session, "studentName": ..., "username": ...})
        """
        s = self._create_session()
        
        # 1. 触发教务处 SSO 入口解析 sp_code
        urp_sso_entry = (
            f"{self.BASE_IDSCU}/enduser/sp/sso/{self.URP_APP_KEY}"
            f"?enterpriseId={self.ENTERPRISE_ID}&target_url=index"
        )
        r_entry = s.get(urp_sso_entry, allow_redirects=True, timeout=12)
        sp_code = ""
        m_go = re.search(r'var goUrl = "(.*?)";', r_entry.text)
        if m_go:
            go_url = m_go.group(1)
            if "sp_code=" in go_url:
                m_sp = re.search(r'sp_code=([^&"\']+)', go_url)
                if m_sp:
                    sp_code = m_sp.group(1)

        if not sp_code:
            return False, "无法从统一认证入口提取教务处 sp_code", {}

        # 2. 调用 sp_logged 重定向兑换教务处登录 Cookie
        sp_url = (
            f"{self.BASE_IDSCU}/api/bff/v1.2/commons/sp_logged"
            f"?sp_code={urllib.parse.quote(sp_code)}"
            f"&application_key={self.URP_APP_KEY}"
            f"&access_token={access_token}"
        )
        s.get(sp_url, allow_redirects=True, timeout=15)

        # 3. 访问教务处首页获取真实姓名与学号
        r_home = s.get(f"{self.BASE_URP}/student/index", headers={"User-Agent": self.UA}, timeout=12)
        html = r_home.text

        # 校验是否已进入教务系统
        name_match = re.search(r'class="userName"[^>]*>([^<]+)<', html)
        student_name = name_match.group(1).strip() if name_match else ""

        user_match = re.search(r'(\d{13})', html)
        username = user_match.group(1) if user_match else ""

        if not student_name and not username and "四川大学教务系统" not in html:
            # 尝试访问个人学期课表页测试会话有效性
            r_test = s.get(f"{self.BASE_URP}/student/personalSenate/giveLessonInfo/thisSemesterSchedule/weekLySchedule", timeout=12)
            if r_test.status_code != 200 or "login" in r_test.url:
                return False, "教务处会话激活未通过，请检查账号权限", {}

        return True, "教务系统会话激活成功", {
            "session": s,
            "cookies": requests.utils.dict_from_cookiejar(s.cookies),
            "studentName": student_name,
            "username": username
        }

    def activate_electricity_session(self, access_token: str) -> Tuple[bool, str, Dict[str, Any]]:
        """
        通过统一认证 access_token 激活电费系统会话并获取绑定的 cusNo 与 cusName
        返回: (success, message, {"session": ..., "cusNo": ..., "cusName": ..., "cookies": ...})
        """
        s = self._create_session()

        # 1. 连接电费统一认证入口
        r_entry = s.get(f"{self.BASE_PAYAPP}/eleFees/oauth/airWarrant", allow_redirects=True, timeout=12)
        sp_code = ""
        app_key = self.ELE_APP_KEY

        m_go = re.search(r'var goUrl = "(.*?)";', r_entry.text)
        if m_go:
            go_url = m_go.group(1)
            if "sp_code=" in go_url:
                m_sp = re.search(r'sp_code=([^&"\']+)', go_url)
                if m_sp:
                    sp_code = m_sp.group(1)

        m_app = re.search(r'application_key=([a-zA-Z0-9_-]+)', r_entry.text)
        if m_app:
            app_key = m_app.group(1)

        if not sp_code:
            return False, "无法从电费系统入口提取 sp_code", {}

        # 2. 访问 sp_logged 完成 CAS 单点登录回跳
        sp_url = (
            f"{self.BASE_IDSCU}/api/bff/v1.2/commons/sp_logged"
            f"?sp_code={urllib.parse.quote(sp_code)}"
            f"&application_key={app_key}"
            f"&access_token={access_token}"
        )
        r_sp = s.get(sp_url, allow_redirects=True, timeout=15)
        
        # 3. 提取绑定的用户信息
        html = r_sp.text
        m_no = re.search(r"var cusNo\s*=\s*'([^']*)'", html) or re.search(r'id="cusNo"[^>]*value="([^"]*)"', html)
        m_name = re.search(r"var cusName\s*=\s*'([^']*)'", html) or re.search(r'id="cusName"[^>]*value="([^"]*)"', html)

        cus_no = m_no.group(1) if m_no else ""
        cus_name = m_name.group(1) if m_name else ""

        # 若未直接提取到，二次刷新 airWarrant 触发重载
        if not cus_no:
            r_w = s.get(f"{self.BASE_PAYAPP}/eleFees/oauth/airWarrant", allow_redirects=True, timeout=15)
            m_no = re.search(r"var cusNo\s*=\s*'([^']*)'", r_w.text) or re.search(r'id="cusNo"[^>]*value="([^"]*)"', r_w.text)
            m_name = re.search(r"var cusName\s*=\s*'([^']*)'", r_w.text) or re.search(r'id="cusName"[^>]*value="([^"]*)"', r_w.text)
            if m_no:
                cus_no = m_no.group(1)
            if m_name:
                cus_name = m_name.group(1)

        return True, "电费系统会话激活成功", {
            "session": s,
            "cookies": requests.utils.dict_from_cookiejar(s.cookies),
            "cusNo": cus_no,
            "cusName": cus_name
        }


# 全局单例
auth_hub = SCUUnifiedAuthHub()
