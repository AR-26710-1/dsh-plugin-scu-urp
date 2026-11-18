"""
四川大学教务系统 (URP) API 客户端
基于 URP_API_SPEC.md 规范实现：
- 双重 MD5 加密
- ddddocr 本地验证码识别与重试
- 24位周次位图解码
- 成绩、学分与 GPA 统计
- 考试安排查询
- Session 自动保活与透明重连
"""
import io
import re
import sys
import time
import hashlib
import datetime
from typing import Dict, Any, List, Optional, Tuple
import requests

try:
    import ddddocr
except ImportError:
    ddddocr = None


class SCUUrpClient:
    BASE_URL = "http://zhjw.scu.edu.cn"

    def __init__(self, username: str = "", password: str = ""):
        self.username = username
        self.password = password
        self.session = requests.Session()
        # 避坑要点：禁用环境代理，防止校园网内网路由被系统科学上网工具劫持
        self.session.trust_env = False
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{self.BASE_URL}/login",
        }
        self._ocr_instance = None
        self.is_logged_in = False
        self.student_name = ""
        self._sso_sessions: Dict[str, Dict[str, Any]] = {}

    @property
    def ocr(self):
        """懒加载 ddddocr 实例并抑制广告和标准输出"""
        if self._ocr_instance is None and ddddocr is not None:
            # 重定向 stdout 避免初始化提示污染通信
            old_stdout = sys.stdout
            try:
                sys.stdout = io.StringIO()
                self._ocr_instance = ddddocr.DdddOcr(show_ad=False)
            finally:
                sys.stdout = old_stdout
        return self._ocr_instance

    @staticmethod
    def _md5_hex(s: str) -> str:
        return hashlib.md5(s.encode("utf-8")).hexdigest()

    @staticmethod
    def _sm3_hex(s: str) -> str:
        """国密 SM3 哈希计算（支持 Python 3.12 原生 hashlib.new('sm3')）"""
        try:
            return hashlib.new("sm3", s.encode("utf-8")).hexdigest().lower()
        except Exception:
            # 极少数环境下不支持时安全回退 md5
            return hashlib.md5(s.encode("utf-8")).hexdigest()

    @classmethod
    def _hex_md5(cls, string: str, ver: str = "") -> str:
        """
        还原教务处前端 /js/md5/md5.min.js 的 hex_md5 加盐算法:
        string = md5_Utf8Encode(string + (ver ? "{" + (ver === "v6" ? "Urp602019" : ver) + "}" : ""));
        """
        if ver:
            salt = "Urp602019" if ver == "v6" else ver
            string = f"{string}{{{salt}}}"
        return cls._md5_hex(string)

    @classmethod
    def encrypt_password(cls, password: str, token_value: str = "", encode_type: str = "md5") -> str:
        """
        四川大学综合教务系统官方前端真实加密逻辑 (源自 /js/login/login.js encodePass)
        - 若 loginEncodeType === "sm3":
            pass = hex_md5(SM3Encode(pwd), token) + '*' + hex_md5(hex_md5(pwd, ''), token)
            其中 SM3Encode(msg) = sm3(msg + "{Urp602023}")
        - 默认 loginEncodeType === "md5":
            pass = hex_md5(hex_md5(pwd, 'v6'), token) + '*' + hex_md5(hex_md5(pwd, ''), token)
            其中 hex_md5(pwd, 'v6') = md5(pwd + "{Urp602019}")
            外层 hex_md5(..., token) = md5(... + "{" + token + "}")
        """
        if encode_type == "sm3":
            sm3_pass = cls._sm3_hex(f"{password}{{Urp602023}}")
            p1 = cls._hex_md5(sm3_pass, token_value)
        else:
            p1 = cls._hex_md5(cls._hex_md5(password, "v6"), token_value)

        p2 = cls._hex_md5(cls._hex_md5(password, ""), token_value)
        return f"{p1}*{p2}"

    def update_credentials(self, username: str, password: str):
        self.username = username
        self.password = password
        self.is_logged_in = False

    def update_session(self, session: requests.Session, username: str = "", student_name: str = ""):
        """从统一认证中枢注入已登录的 requests.Session 与用户信息"""
        self.session.cookies.clear()
        self.session.cookies.update(session.cookies)
        self.is_logged_in = True
        if username:
            self.username = username
        if student_name:
            self.student_name = student_name

    def _get_cookie_safe(self, name: str) -> str:
        """安全读取 Cookie，避免 requests 抛出 CookieConflictError"""
        for cookie in self.session.cookies:
            if cookie.name == name:
                return cookie.value
        return ""

    def login(self, max_retries: int = 5) -> Tuple[bool, str]:
        """
        执行教务系统登录流程，带会话修复、字符清洗与自动重试
        """
        if not self.username or not self.password:
            return False, "学号或密码为空"

        for attempt in range(1, max_retries + 1):
            try:
                # 每次登录尝试前清空旧会话，确保干净的环境
                self.session.cookies.clear()

                # 1. 访问登录页面
                login_page_resp = self.session.get(f"{self.BASE_URL}/login", headers=self.headers, timeout=12)
                html = login_page_resp.text

                # 提取动态 tokenValue 与加密类型 loginEncodeType
                token_match = re.search(r'(?:id|name)=[\'"]tokenValue[\'"][^>]*value=[\'"]([^\'"]+)[\'"]', html, re.IGNORECASE) or \
                              re.search(r'value=[\'"]([^\'"]+)[\'"][^>]*(?:id|name)=[\'"]tokenValue[\'"]', html, re.IGNORECASE)
                token_value = token_match.group(1) if token_match else ""

                encode_match = re.search(r'(?:id|name)=[\'"]loginEncodeType[\'"][^>]*value=[\'"]([^\'"]+)[\'"]', html, re.IGNORECASE) or \
                               re.search(r'value=[\'"]([^\'"]+)[\'"][^>]*(?:id|name)=[\'"]loginEncodeType[\'"]', html, re.IGNORECASE)
                encode_type = encode_match.group(1).lower() if encode_match else "md5"

                hidden_inputs = {}
                for m in re.finditer(r'<input[^>]+type=[\'"]hidden[\'"][^>]*>', html, re.IGNORECASE):
                    tag = m.group(0)
                    name_m = re.search(r'name=[\'"]([^\'"]+)[\'"]', tag)
                    val_m = re.search(r'value=[\'"]([^\'"]*)[\'"]', tag)
                    if name_m and val_m:
                        hidden_inputs[name_m.group(1)] = val_m.group(1)

                # 2. 获取验证码图片，并清洗噪点确保 4 位有效字母数字
                captcha_code = ""
                captcha_attempts = 0
                while len(captcha_code) != 4 and captcha_attempts < 3:
                    captcha_attempts += 1
                    timestamp = int(time.time() * 1000)
                    captcha_url = f"{self.BASE_URL}/img/captcha.jpg?_={timestamp}"
                    captcha_resp = self.session.get(captcha_url, timeout=12)

                    if self.ocr is None:
                        return False, "未安装或无法加载 ddddocr 识别引擎"

                    # 修复 Cookie 作用域与 Secure 标记：
                    # 教务处下发 /img/captcha.jpg 时将 JSESSIONID 的 Path 设为了 /img，且带了 Secure 标记。
                    # 在 HTTP 环境下 requests 会拒绝向 /j_spring_security_check 携带它，导致服务端找不到验证码 Session！
                    jsessionid = None
                    for c in list(self.session.cookies):
                        if c.name == "JSESSIONID":
                            jsessionid = c.value
                            break

                    if jsessionid:
                        self.session.cookies.set("JSESSIONID", jsessionid, domain="zhjw.scu.edu.cn", path="/")

                    raw_code = self.ocr.classification(captcha_resp.content)
                    # 过滤可能识别出的噪点标点符号（如 '+', '-', '.'）和中文乱码，保留 4 位字母数字
                    clean_code = re.sub(r"[^a-zA-Z0-9]", "", raw_code)
                    if len(clean_code) == 4:
                        captcha_code = clean_code
                        break
                    elif len(clean_code) > 4:
                        # 若仅因首尾噪点多出，取前 4 位
                        captcha_code = clean_code[:4]
                        break

                if not captcha_code:
                    continue

                # 3. 构造请求载荷与头部（动态 tokenValue 双重 MD5 / SM3 拼接 * 加密）
                encrypted_pwd = self.encrypt_password(self.password, token_value, encode_type)
                payload = {
                    "j_username": self.username,
                    "j_password": encrypted_pwd,
                    "j_captcha": captcha_code,
                    "tokenValue": token_value,
                    **hidden_inputs,
                }

                # 确保请求头携带正确的 Referer 与 Cookie
                post_headers = {
                    **self.headers,
                    "Referer": f"{self.BASE_URL}/login",
                }

                login_resp = self.session.post(
                    f"{self.BASE_URL}/j_spring_security_check",
                    data=payload,
                    headers=post_headers,
                    allow_redirects=True,
                    timeout=15,
                )

                resp_text = login_resp.text
                final_url = login_resp.url

                # 1. 登录成功判断
                if "退出系统" in resp_text or "/student/" in final_url or "top_img" in resp_text:
                    self.is_logged_in = True
                    name_match = re.search(r'class="userName"[^>]*>([^<]+)<', resp_text)
                    if name_match:
                        self.student_name = name_match.group(1).strip()
                    return True, "登录成功"

                # 2. 从重定向 URL 中的 errorCode 参数精准提取错误类型
                error_code_match = re.search(r'[?&]errorCode=([^&#]+)', final_url)
                error_code = error_code_match.group(1) if error_code_match else ""

                # 3. 从页面 alert 提示框中提取教务处真实提示文字
                alert_text = ""
                alert_match = re.search(r'class="[^"]*alert[^"]*"[^>]*>(?:[\s\S]*?<strong>[^<]*</strong>)?\s*([^<]+)', resp_text)
                if alert_match:
                    alert_text = alert_match.group(1).strip()

                # 精确密码错误诊断（避免被宽泛的“验证码”字样误判为验证码错误）
                if error_code == "badCredentials" or "用户密码错误" in alert_text or "密码错误" in resp_text:
                    return False, "教务系统提示: 用户密码错误，请检查学号与密码（注意：综合教务系统密码可能与学校统一认证密码不同）"

                if error_code == "accountLocked" or "锁定" in alert_text:
                    return False, f"教务系统提示: 账号已被锁定 ({alert_text or '请稍后再试或联系教务管理员'})"

                if error_code == "badCaptcha" or "验证码错误" in alert_text:
                    if attempt < max_retries:
                        time.sleep(0.3)
                        continue
                    return False, "验证码识别错误，重试超限"

                if "token校验失败" in resp_text or error_code == "invalidToken":
                    time.sleep(0.3)
                    continue

                # 兜底返回真实服务端 alert
                if alert_text:
                    return False, f"教务系统提示: {alert_text}"

                if attempt >= max_retries:
                    return False, "登录未能成功，请检查学号与密码是否正确"

            except Exception as e:
                if attempt >= max_retries:
                    return False, f"登录网络异常: {str(e)}"
                if attempt >= max_retries:
                    return False, f"登录网络异常: {str(e)}"

        return False, "教务系统登录未能成功，请检查网络或账号密码"

    def request(self, method: str, path: str, **kwargs) -> requests.Response:
        """带自动重连与会话保活的统一请求封装"""
        url = path if path.startswith("http") else f"{self.BASE_URL}{path}"
        resp = self.session.request(method, url, headers=self.headers, timeout=15, **kwargs)

        # 检查是否重定向到登录页或返回未登录状态
        if "/login" in resp.url or resp.status_code in (302, 401) or "登录" in resp.text[:400]:
            self.is_logged_in = False
            ok, msg = self.login()
            if ok:
                resp = self.session.request(method, url, headers=self.headers, timeout=15, **kwargs)
            else:
                raise RuntimeError(f"教务系统会话失效且自动重登失败: {msg}")

        resp.raise_for_status()
        return resp

    def load_session_cookies(self, cookies: Dict[str, str]) -> bool:
        """载入持久化的 Session Cookies 并验证恢复会话"""
        self.session.cookies.clear()
        self.session.cookies.update(cookies)
        return self.verify_session_alive()

    def verify_session_alive(self) -> bool:
        """轻量级探针检测当前 Session 是否存活且已登录"""
        try:
            test_url = f"{self.BASE_URL}/student/personalSenate/giveLessonInfo/thisSemesterSchedule/weekLySchedule"
            resp = self.session.get(test_url, headers=self.headers, timeout=8, allow_redirects=True)
            if "/login" in resp.url or resp.status_code in (302, 401) or "登录" in resp.text[:400]:
                self.is_logged_in = False
                return False
            self.is_logged_in = True
            if not self.student_name:
                # 尝试从主页抓取姓名
                r_home = self.session.get(f"{self.BASE_URL}/student/index", headers=self.headers, timeout=8)
                m = re.search(r'class="userName"[^>]*>([^<]+)<', r_home.text)
                if m:
                    self.student_name = m.group(1).strip()
            return True
        except Exception:
            self.is_logged_in = False
            return False

    def keep_alive(self) -> bool:
        """
        轻量级教务系统会话保活探针
        定时向教务系统发送心跳探针，无论密码凭据还是扫码会话均能实现长效保活
        """
        if not self.username and not self.session.cookies:
            return False
        try:
            alive = self.verify_session_alive()
            if alive:
                return True
            # 若失效且存在账密，则尝试透明静默重连
            if self.username and self.password:
                ok, _ = self.login()
                return ok
            return False
        except Exception:
            return False

    def start_sso_qrcode(self) -> Dict[str, Any]:
        """
        初始化四川大学统一身份认证 (竹云 IDaaS) 微信/微川大扫码登录会话
        """
        import base64
        import urllib.parse

        s = requests.Session()
        s.trust_env = False
        s.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": "https://id.scu.edu.cn/frontend/login",
        })

        # 1. 请求教务处 SSO 入口解析 sp_code
        sso_entry = "https://id.scu.edu.cn/enduser/sp/sso/scdxplugin_jwt23?enterpriseId=scdx&target_url=index"
        r1 = s.get(sso_entry, allow_redirects=True, timeout=12)
        sp_code = ""
        m = re.search(r'var goUrl = "(.*?)";', r1.text)
        if m:
            go_url = m.group(1)
            if "#/login?" in go_url:
                frag_query = go_url.split("#/login?")[1]
                qs = urllib.parse.parse_qs(frag_query)
                sp_code = qs.get("sp_code", [""])[0]

        # 2. 调用 init_code 获取扫码临时会话票据
        r2 = s.get("https://id.scu.edu.cn/api/public/bff/v1.2/one_time_login/init_code?enterpriseId=scdx", timeout=10)
        d2 = r2.json()
        code = d2.get("data", {}).get("code")
        if not code:
            raise Exception("获取统一认证扫码临时标识失败")

        # 3. 获取实时二维码图片并转换为 Base64
        r3 = s.get(f"https://id.scu.edu.cn/api/public/bff/v1.2/one_time_login/show/{code}?enterpriseId=scdx", timeout=10)
        qr_b64 = base64.b64encode(r3.content).decode("ascii")

        self._sso_sessions[code] = {
            "session": s,
            "sp_code": sp_code,
            "created_at": time.time(),
        }

        return {
            "code": code,
            "qrcode": f"data:image/png;base64,{qr_b64}",
            "expiresIn": 180,
        }

    def check_sso_qrcode(self, code: str) -> Tuple[str, str, Dict[str, Any]]:
        """
        轮询检测统一认证二维码扫码状态
        用户确认扫码后自动兑换教务处会话，并提取学号与姓名
        """
        import urllib.parse

        record = self._sso_sessions.get(code)
        if not record:
            return "EXPIRED", "二维码已失效，请重新生成", {}

        if time.time() - record["created_at"] > 180:
            self._sso_sessions.pop(code, None)
            return "EXPIRED", "二维码已超时，请刷新重试", {}

        s = record["session"]
        try:
            r = s.get(
                f"https://id.scu.edu.cn/api/public/bff/v1.2/one_time_login/obtain_confirm_status/{code}?enterpriseId=scdx",
                timeout=10,
            )
            data = r.json()
            is_confirmed = data.get("data", {}).get("result", False)

            if not is_confirmed:
                return "WAITING", "等待微信或微川大扫码确认...", {}

            # 扫码确认！调用 success 接口兑换 access_token
            r_succ = s.post(
                f"https://id.scu.edu.cn/api/public/bff/v1.2/one_time_login/success/{code}",
                json={"code": code, "enterpriseId": "scdx"},
                timeout=10,
            )
            token_data = r_succ.json()
            access_token = token_data.get("data", {}).get("access_token", "")

            # 调用 sp_logged 单点登录重定向跳回综合教务处
            sp_code = record["sp_code"]
            sp_url = (
                f"https://id.scu.edu.cn/api/bff/v1.2/commons/sp_logged"
                f"?sp_code={urllib.parse.quote(sp_code)}&application_key=scdxplugin_jwt23"
            )
            if access_token:
                sp_url += f"&access_token={access_token}"

            s.get(sp_url, allow_redirects=True, timeout=15)

            # 同步所有 Cookie 到全局教务客户端
            self.session.cookies.clear()
            self.session.cookies.update(s.cookies)

            # 访问教务处首页获取学生真实姓名与学号
            r_home = self.session.get(f"{self.BASE_URL}/student/index", headers=self.headers, timeout=12)
            html = r_home.text

            name_match = re.search(r'class="userName"[^>]*>([^<]+)<', html)
            student_name = name_match.group(1).strip() if name_match else ""

            user_match = re.search(r'(\d{13})', html)
            username = user_match.group(1) if user_match else ""

            self.is_logged_in = True
            if student_name:
                self.student_name = student_name
            if username:
                self.username = username

            cookies_dict = requests.utils.dict_from_cookiejar(self.session.cookies)
            self._sso_sessions.pop(code, None)

            return "SUCCESS", "统一身份认证扫码登录成功！", {
                "studentName": self.student_name,
                "username": self.username,
                "cookies": cookies_dict,
            }
        except Exception as e:
            return "ERROR", f"扫码认证校验异常: {str(e)}", {}

    @staticmethod
    def parse_class_weeks(class_week_bitmap: str) -> List[int]:
        """
        解析 24 位周次位图字符串
        例如 '0111111000...' -> [2, 3, 4, 5, 6, 7]
        """
        active_weeks = []
        for idx, bit in enumerate(class_week_bitmap[:24]):
            if bit == "1":
                active_weeks.append(idx + 1)
        return active_weeks

    @staticmethod
    def parse_weeks_from_description(desc: str) -> List[int]:
        """
        从周次文字描述中智能解析整型周次列表（针对《形势与政策》等集中授课或单双周课程）
        严格限定周次上限为 1~30 周，防止将教室号（如 301/302）误判为周次。
        例如: '第1-8周(单)', '第4-8周', '第5周,第8周,第12周', '1-16周'
        """
        if not desc:
            return []
        weeks = set()
        # 模式 1: 显式带 '周' 的区间或单周，如 '第6-10周', '4-8周(双)', '第5周'
        for m in re.finditer(r'(?:第)?(\d+)(?:[-~至到](\d+))?周(?:\(([单双])\))?', desc):
            try:
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else start
                odd_even = m.group(3)
                if 1 <= start <= 30 and 1 <= end <= 30:
                    for w in range(start, end + 1):
                        if odd_even == '单' and w % 2 == 0:
                            continue
                        if odd_even == '双' and w % 2 != 0:
                            continue
                        weeks.add(w)
            except Exception:
                continue

        # 模式 2: 逗号/顿号隔开的周次列表，如 '1,3,5周' 或 '1、3、5周'
        m_list = re.search(r'((?:\d+[、,，\s]+)+\d+)周', desc)
        if m_list:
            for num_s in re.findall(r'\d+', m_list.group(1)):
                try:
                    w = int(num_s)
                    if 1 <= w <= 30:
                        weeks.add(w)
                except Exception:
                    pass

        return sorted(list(weeks))

    @staticmethod
    def _parse_schedule_from_text(text: str) -> Tuple[int, int, int, str]:
        """
        从排课备注或综合文本中正则解析星期 (1-7)、起始节次、持续节次与教室
        例如: '周三 第1-2节 综B303' -> (3, 1, 2, '综B303')
        """
        if not text:
            return 0, 0, 0, ""
        day_map = {
            "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7,
            "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
        }
        day = 0
        m_day = re.search(r'(?:周|星期)([一二三四五六日天1-7])', text)
        if m_day:
            day = day_map.get(m_day.group(1), 0)

        start_sec = 0
        cont_sec = 2
        m_sec = re.search(r'第?(\d+)(?:[-~至到](\d+))?节', text)
        if m_sec:
            try:
                start_sec = int(m_sec.group(1))
                if m_sec.group(2):
                    cont_sec = max(1, int(m_sec.group(2)) - start_sec + 1)
                else:
                    cont_sec = 1
            except Exception:
                pass

        room = ""
        m_room = re.search(
            r'((?:[一二三四五六七八]教|综合楼|综|基教楼|文科楼|二基楼|临医楼|逸夫楼)[A-Za-z0-9-座区]*|\d{3,4}|[A-Za-z0-9-]+教室)',
            text,
        )
        if m_room:
            room = m_room.group(1)

        return day, start_sec, cont_sec, room

    def get_schedule(self) -> Dict[str, Any]:
        """
        获取并整理个人课表数据
        深度支持《形势与政策》、创新创业、实验实践等阶段性集中授课课程的完整识别与时间地点补全
        """
        # 1. 提取当前学年编号
        page = self.request("GET", "/student/personalSenate/giveLessonInfo/thisSemesterSchedule/weekLySchedule").text
        sem_match = re.search(r'soliderboxval[^>]*value="([^"]+)"', page)
        if not sem_match:
            raise RuntimeError("未能从教务系统页面中提取当前学期编号")
        semester_id = sem_match.group(1)

        # 2. 拉取课表详情
        data = self.request(
            "GET",
            f"/student/courseSelect/thisSemesterCurriculum/ajaxStudentSchedule/weekLySchedule/callback/{semester_id}",
        ).json()

        # 收集所有原始课程候选池（去重归一化）
        raw_courses_pool: List[Dict[str, Any]] = []

        # (1) 主周历时间表 dateList
        date_list = data.get("dateList") or []
        for item in date_list:
            if not isinstance(item, dict):
                continue
            sub_list = item.get("selectCourseList") or []
            for c in sub_list:
                if isinstance(c, dict):
                    raw_courses_pool.append(c)

        # (2) 补充扫描其他课程字段（如 allCourseList, notArrangementCourseList 等，覆盖《形势与政策》等未进周历网格的课程）
        for extra_key in ("allCourseList", "otherCourseList", "notArrangementCourseList", "noScheduleList", "selectCourseList"):
            extra_list = data.get(extra_key) or []
            if isinstance(extra_list, list):
                for c in extra_list:
                    if isinstance(c, dict):
                        raw_courses_pool.append(c)

        # 按课程标识合并与组织课表
        courses_map: Dict[str, Dict[str, Any]] = {}

        for c in raw_courses_pool:
            cid = c.get("id") or {}
            if isinstance(cid, dict):
                c_num = str(cid.get("coureNumber") or c.get("coureNumber") or c.get("courseNumber") or "").strip()
                c_seq = str(cid.get("coureSequenceNumber") or c.get("coureSequenceNumber") or c.get("classNum") or "").strip()
            else:
                c_num = str(c.get("coureNumber") or c.get("courseNumber") or "").strip()
                c_seq = str(c.get("coureSequenceNumber") or c.get("classNum") or "").strip()

            c_name = str(c.get("courseName") or c.get("kcm") or "").strip()
            if not c_name:
                continue

            course_key = f"{c_num}_{c_seq}" if c_num else c_name

            # 基础信息解析
            prop = str(c.get("coursePropertiesName") or c.get("kclbmc") or "").strip()
            teacher = str(c.get("attendClassTeacher") or c.get("skjs") or "").strip().rstrip("*")
            try:
                credit = float(c.get("unit") or c.get("xf") or 0.0)
            except (ValueError, TypeError):
                credit = 0.0

            pkbz = str(c.get("pkbz") or c.get("PKBZ") or "").strip()
            skzcs = str(c.get("skzcs") or c.get("zcsm") or "").strip()
            exam_type = str(c.get("examTypeName") or "").strip()

            # 解析排期与时间地点
            time_places: List[Dict[str, Any]] = []
            tp_list = c.get("timeAndPlaceList") or []

            if isinstance(tp_list, list) and len(tp_list) > 0:
                for tp in tp_list:
                    if not isinstance(tp, dict):
                        continue
                    raw_bitmap = str(tp.get("classWeek") or "")
                    w_desc = str(tp.get("weekDescription") or skzcs or pkbz or "").strip()

                    # 智能解析周次：优先位图；若位图为空或全 0，自动从文字说明中解析！
                    weeks = self.parse_class_weeks(raw_bitmap) if raw_bitmap else []
                    if not weeks and w_desc:
                        weeks = self.parse_weeks_from_description(w_desc)

                    raw_day = tp.get("classDay")
                    raw_start = tp.get("classSessions")
                    raw_cont = tp.get("continuingSession", 2) or 2
                    c_room = str(tp.get("classroomName") or "").strip()
                    c_bldg = str(tp.get("teachingBuildingName") or "").strip()
                    c_campus = str(tp.get("campusName") or "").strip()

                    # 若星期或节次缺失，尝试从备注与文本中智能补全（针对阶段性集中上课）
                    if not raw_day or raw_day == 0 or not raw_start or raw_start == 0:
                        parsed_d, parsed_s, parsed_c, parsed_r = self._parse_schedule_from_text(f"{w_desc} {pkbz} {c_room}")
                        if parsed_d > 0 and (not raw_day or raw_day == 0):
                            raw_day = parsed_d
                        if parsed_s > 0 and (not raw_start or raw_start == 0):
                            raw_start = parsed_s
                            raw_cont = parsed_c
                        if not c_room and parsed_r:
                            c_room = parsed_r

                    time_places.append({
                        "day": int(raw_day) if (raw_day and str(raw_day).isdigit()) else 0,
                        "startSession": int(raw_start) if (raw_start and str(raw_start).isdigit()) else 0,
                        "continuingSessions": int(raw_cont) if (raw_cont and str(raw_cont).isdigit()) else 2,
                        "building": c_bldg,
                        "classroom": c_room or ("详见备注" if pkbz else "待安排"),
                        "campus": c_campus,
                        "weekDescription": w_desc,
                        "rawWeeks": raw_bitmap,
                        "weeks": weeks,
                    })

            # 若 timeAndPlaceList 为空列表（典型如《形势与政策》等集中授课或实践类课程）
            if not time_places:
                raw_day = c.get("skxq") or c.get("classDay")
                raw_start = c.get("skjc") or c.get("classSessions")
                raw_cont = c.get("cxjc") or c.get("continuingSession") or 2
                c_room = str(c.get("jasm") or c.get("classroomName") or "").strip()
                c_bldg = str(c.get("teachingBuildingName") or "").strip()
                c_campus = str(c.get("campusName") or "").strip()

                combined_text = f"{pkbz} {skzcs} {c_room}".strip()
                parsed_d, parsed_s, parsed_c, parsed_r = self._parse_schedule_from_text(combined_text)

                final_day = int(raw_day) if (raw_day and str(raw_day).isdigit() and int(raw_day) > 0) else parsed_d
                final_start = int(raw_start) if (raw_start and str(raw_start).isdigit() and int(raw_start) > 0) else parsed_s
                final_cont = int(raw_cont) if (raw_cont and str(raw_cont).isdigit() and int(raw_cont) > 0) else parsed_c
                final_room = c_room or parsed_r or (pkbz if pkbz else "见任课教师通知")

                desc = pkbz or skzcs or "阶段性/专题集中授课"
                weeks = self.parse_weeks_from_description(desc)

                time_places.append({
                    "day": final_day,
                    "startSession": final_start,
                    "continuingSessions": final_cont,
                    "building": c_bldg,
                    "classroom": final_room,
                    "campus": c_campus,
                    "weekDescription": desc,
                    "rawWeeks": "",
                    "weeks": weeks,
                    "isSpecialSchedule": True,  # 标注为阶段性或特殊授课
                })

            # 合并到现有课程或新增课程
            if course_key in courses_map:
                existing = courses_map[course_key]
                # 合并 schedules，根据 (day, startSession, classroom) 去重
                existing_schedules = existing["schedules"]
                existing_fingerprints = {
                    (s.get("day"), s.get("startSession"), s.get("classroom"), tuple(s.get("weeks", [])))
                    for s in existing_schedules
                }
                for tp in time_places:
                    fp = (tp.get("day"), tp.get("startSession"), tp.get("classroom"), tuple(tp.get("weeks", [])))
                    if fp not in existing_fingerprints:
                        existing_schedules.append(tp)
                        existing_fingerprints.add(fp)
                if not existing.get("note") and pkbz:
                    existing["note"] = pkbz
            else:
                courses_map[course_key] = {
                    "name": c_name,
                    "courseNumber": c_num,
                    "unitNumber": c_seq,
                    "property": prop,
                    "teacher": teacher,
                    "credit": credit,
                    "examType": exam_type,
                    "note": pkbz,
                    "schedules": time_places,
                }

        formatted_courses = list(courses_map.values())

        return {
            "semesterId": semester_id,
            "totalCourses": len(formatted_courses),
            "courses": formatted_courses,
        }

    @staticmethod
    def calculate_gpa(score_str: str, grade_level: str = "") -> float:
        """
        四川大学标准绩点换算逻辑 (五级等级制与百分制对照)
        """
        # 五级制对照优先
        grade_upper = (grade_level or "").strip().upper()
        gpa_map = {
            "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7,
            "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "F": 0.0,
            "优秀": 4.0, "良好": 3.3, "中等": 2.3, "及格": 1.0, "不及格": 0.0
        }
        if grade_upper in gpa_map:
            return gpa_map[grade_upper]

        try:
            num = float(score_str)
            if num >= 90: return 4.0
            if num >= 85: return 3.7
            if num >= 82: return 3.3
            if num >= 78: return 3.0
            if num >= 75: return 2.7
            if num >= 72: return 2.3
            if num >= 68: return 2.0
            if num >= 64: return 1.5
            if num >= 60: return 1.0
            return 0.0
        except ValueError:
            return 0.0

    def get_grades(self) -> Dict[str, Any]:
        """获取全量成绩并计算加权绩点与均分"""
        page = self.request("GET", "/student/integratedQuery/scoreQuery/allTermScores/index").text
        token_match = re.search(r"/scoreQuery/([^/]+)/allTermScores/data", page)
        if not token_match:
            raise RuntimeError("未能从成绩页面获取动态安全 Token")
        token = token_match.group(1)

        raw_data = self.request(
            "POST",
            f"/student/integratedQuery/scoreQuery/{token}/allTermScores/data",
            data={"pageNum": 1, "pageSize": 1000},
        ).json()

        raw_list = []
        if isinstance(raw_data, dict):
            list_field = raw_data.get("list")
            if isinstance(list_field, dict):
                raw_list = list_field.get("records") or []
            elif isinstance(list_field, list):
                raw_list = list_field
            else:
                raw_list = raw_data.get("records") or []
        elif isinstance(raw_data, list):
            raw_list = raw_data

        formatted_grades = []
        total_credit = 0.0
        weighted_gpa_sum = 0.0
        weighted_score_sum = 0.0
        score_credit_sum = 0.0

        # 必修课程专用统计 (保研与评奖指标)
        req_credit = 0.0
        req_gpa_sum = 0.0
        req_score_sum = 0.0
        req_score_credit = 0.0
        req_course_count = 0

        # 按学期分组统计容器
        term_groups: Dict[str, List[Dict[str, Any]]] = {}

        for g in raw_list:
            if not isinstance(g, dict):
                continue
            kcm = g.get("KCM") or ""
            kch = g.get("KCH") or ""
            kxh = g.get("KXH") or ""
            try:
                credit = float(g.get("XF") or 0.0)
            except (ValueError, TypeError):
                credit = 0.0

            score = str(g.get("KCCJ") or "")
            djm = g.get("DJM") or ""
            term = g.get("ZXJXJHM") or ""
            prop = g.get("KCSXMC") or ""
            unpass_reason = g.get("WTGYYSM") or ""

            # 若录入方式为等级制 (002)，优先展示等级名称
            display_score = djm if g.get("CJLRFSDM") == "002" and djm else (score or djm)
            gpa = self.calculate_gpa(score, djm)

            item = {
                "name": kcm,
                "code": f"{kch}_{kxh}" if kxh else kch,
                "term": term,
                "credit": credit,
                "score": display_score,
                "rawScore": score,
                "gradeLevel": djm,
                "property": prop,
                "isRequired": (prop == "必修"),
                "gpa": gpa,
                "unpassReason": unpass_reason,
            }
            formatted_grades.append(item)

            if term:
                term_groups.setdefault(term, []).append(item)

            if credit > 0:
                total_credit += credit
                weighted_gpa_sum += gpa * credit
                try:
                    num_score = float(score)
                    weighted_score_sum += num_score * credit
                    score_credit_sum += credit
                except (ValueError, TypeError):
                    pass

                # 必修课加权累计
                if prop == "必修":
                    req_course_count += 1
                    req_credit += credit
                    req_gpa_sum += gpa * credit
                    try:
                        num_score = float(score)
                        req_score_sum += num_score * credit
                        req_score_credit += credit
                    except (ValueError, TypeError):
                        pass

        avg_gpa = round(weighted_gpa_sum / total_credit, 2) if total_credit > 0 else 0.0
        avg_score = round(weighted_score_sum / score_credit_sum, 2) if score_credit_sum > 0 else 0.0

        required_gpa = round(req_gpa_sum / req_credit, 2) if req_credit > 0 else 0.0
        required_avg_score = round(req_score_sum / req_score_credit, 2) if req_score_credit > 0 else 0.0

        # 学期统计按时间正序排序
        sorted_terms = sorted(list(term_groups.keys()))
        term_stats = []
        for t in sorted_terms:
            t_items = term_groups[t]
            t_credit = sum(x["credit"] for x in t_items)
            t_gpa_sum = sum(x["gpa"] * x["credit"] for x in t_items)
            t_score_credit = 0.0
            t_score_sum = 0.0
            for x in t_items:
                try:
                    num = float(x["rawScore"])
                    t_score_sum += num * x["credit"]
                    t_score_credit += x["credit"]
                except (ValueError, TypeError):
                    pass

            term_stats.append({
                "term": t,
                "coursesCount": len(t_items),
                "credits": round(t_credit, 1),
                "gpa": round(t_gpa_sum / t_credit, 2) if t_credit > 0 else 0.0,
                "avgScore": round(t_score_sum / t_score_credit, 2) if t_score_credit > 0 else 0.0,
            })

        return {
            "totalCourses": len(formatted_grades),
            "totalCredit": round(total_credit, 1),
            "overallGpa": avg_gpa,
            "overallAvgScore": avg_score,
            "requiredGpa": required_gpa,
            "requiredCredit": round(req_credit, 1),
            "requiredCourses": req_course_count,
            "requiredAvgScore": required_avg_score,
            "termStats": term_stats,
            "terms": sorted(list(term_groups.keys()), reverse=True),
            "grades": formatted_grades,
        }

    def get_exams(self) -> Dict[str, Any]:
        """获取近期考试日程安排"""
        now = datetime.date.today()
        start_date = (now - datetime.timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = (now + datetime.timedelta(days=120)).strftime("%Y-%m-%d")

        url = f"/student/examinationManagement/examPlan/detail?start={start_date}&end={end_date}"
        resp = self.request("GET", url)
        data = resp.json()

        raw_list = []
        if isinstance(data, dict):
            raw_list = data.get("list") or []
        elif isinstance(data, list):
            raw_list = data

        results = []
        for e in raw_list:
            if not isinstance(e, dict):
                continue
            results.append({
                "courseName": e.get("kcm") or e.get("title") or "",
                "examTime": e.get("kssj") or (f"{e.get('start', '')} ~ {e.get('end', '')}" if e.get("start") else ""),
                "location": e.get("ksdd") or e.get("place") or "",
                "seatNumber": e.get("zwh") or "",
                "status": e.get("status") or "",
            })

        return {
            "totalExams": len(results),
            "exams": results,
            "message": "当前区间暂无已排定的考试安排" if not results else "获取成功",
        }

    # ================== 空闲教室 / 考研自习室查询 ==================

    SCU_CAMPUS_DICT = [
        {"name": "江安校区", "code": "03", "short": "江安"},
        {"name": "望江校区", "code": "01", "short": "望江"},
        {"name": "华西校区", "code": "02", "short": "华西"},
    ]

    # 各校区常用自习教学楼预设
    SCU_BUILDINGS_DICT = {
        "03": [
            {"code": "301", "name": "一教A座", "aliases": ["一教A座", "一教A", "301"]},
            {"code": "302", "name": "一教B座", "aliases": ["一教B座", "一教B", "302"]},
            {"code": "303", "name": "一教C座", "aliases": ["一教C座", "一教C", "303"]},
            {"code": "304", "name": "一教D座", "aliases": ["一教D座", "一教D", "304"]},
            {"code": "305", "name": "综合楼B座", "aliases": ["综合楼B座", "综B", "305"]},
            {"code": "306", "name": "综合楼C座", "aliases": ["综合楼C座", "综C", "306"]},
            {"code": "334", "name": "二基楼B座", "aliases": ["二基楼B座", "二基楼", "334"]},
            {"code": "340", "name": "文科楼一区", "aliases": ["文科楼一区", "文科楼1区", "340"]},
            {"code": "347", "name": "文科楼二区", "aliases": ["文科楼二区", "文科楼2区", "347"]},
            {"code": "349", "name": "文科楼三区", "aliases": ["文科楼三区", "文科楼3区", "349"]},
            {"code": "353", "name": "文科楼四区", "aliases": ["文科楼四区", "文科楼4区", "353"]},
            {"code": "356", "name": "匹兹堡学院北楼", "aliases": ["匹兹堡北楼", "匹兹堡学院", "356"]},
            {"code": "357", "name": "现代工学互动教学中心", "aliases": ["工学互动中心", "南楼", "357"]},
        ],
        "01": [
            {"code": "101", "name": "一教", "aliases": ["一教", "望江一教", "101"]},
            {"code": "102", "name": "二教", "aliases": ["二教", "望江二教", "102"]},
            {"code": "103", "name": "三教", "aliases": ["三教", "望江三教", "103"]},
            {"code": "104", "name": "基教楼A座", "aliases": ["基教楼A座", "基教A", "104"]},
            {"code": "105", "name": "基教楼C座", "aliases": ["基教楼C座", "基教C", "105"]},
            {"code": "106", "name": "五教", "aliases": ["五教", "106"]},
            {"code": "108", "name": "基教楼B座", "aliases": ["基教楼B座", "基教B", "电气学院", "108"]},
            {"code": "155", "name": "四教", "aliases": ["四教", "155"]},
            {"code": "176", "name": "文科楼", "aliases": ["文科楼", "望江文科楼", "176"]},
            {"code": "177", "name": "西区逸夫科技楼", "aliases": ["逸夫科技楼", "177"]},
        ],
        "02": [
            {"code": "201", "name": "临医楼", "aliases": ["临医楼", "201"]},
            {"code": "202", "name": "二教", "aliases": ["二教", "华西二教", "202"]},
            {"code": "203", "name": "三教", "aliases": ["三教", "华西三教", "203"]},
            {"code": "207", "name": "四教", "aliases": ["四教", "华西四教", "207"]},
            {"code": "208", "name": "八教", "aliases": ["八教", "208"]},
            {"code": "218", "name": "逸夫楼", "aliases": ["逸夫楼", "华西逸夫楼", "218"]},
            {"code": "220", "name": "第四教学楼", "aliases": ["第四教学楼", "220"]},
            {"code": "221", "name": "第六教学楼", "aliases": ["第六教学楼", "221"]},
        ],
    }

    # 四川大学官方本科教学作息时间表 (来源: 四川大学教务处 https://jwc.scu.edu.cn/scdxbkjxzxsj.htm)
    # 1. 望江、华西校区教学时间安排表
    SCU_TIMETABLE_WANGJIANG_HUAXI = [
        {"session": 1, "start": "08:00", "end": "08:45", "period": "上午", "label": "第1节 (08:00 - 08:45)"},
        {"session": 2, "start": "08:55", "end": "09:40", "period": "上午", "label": "第2节 (08:55 - 09:40)"},
        {"session": 3, "start": "10:00", "end": "10:45", "period": "上午", "label": "第3节 (10:00 - 10:45)"},
        {"session": 4, "start": "10:55", "end": "11:40", "period": "上午", "label": "第4节 (10:55 - 11:40)"},
        {"session": 5, "start": "14:00", "end": "14:45", "period": "下午", "label": "第5节 (14:00 - 14:45)"},
        {"session": 6, "start": "14:55", "end": "15:40", "period": "下午", "label": "第6节 (14:55 - 15:40)"},
        {"session": 7, "start": "15:50", "end": "16:35", "period": "下午", "label": "第7节 (15:50 - 16:35)"},
        {"session": 8, "start": "16:55", "end": "17:40", "period": "下午", "label": "第8节 (16:55 - 17:40)"},
        {"session": 9, "start": "17:50", "end": "18:35", "period": "下午", "label": "第9节 (17:50 - 18:35)"},
        {"session": 10, "start": "19:30", "end": "20:15", "period": "晚上", "label": "第10节 (19:30 - 20:15)"},
        {"session": 11, "start": "20:25", "end": "21:10", "period": "晚上", "label": "第11节 (20:25 - 21:10)"},
        {"session": 12, "start": "21:20", "end": "22:05", "period": "晚上", "label": "第12节 (21:20 - 22:05)"},
    ]

    # 2. 江安校区教学时间安排表
    SCU_TIMETABLE_JIANGAN = [
        {"session": 1, "start": "08:15", "end": "09:00", "period": "上午", "label": "第1节 (08:15 - 09:00)"},
        {"session": 2, "start": "09:10", "end": "09:55", "period": "上午", "label": "第2节 (09:10 - 09:55)"},
        {"session": 3, "start": "10:15", "end": "11:00", "period": "上午", "label": "第3节 (10:15 - 11:00)"},
        {"session": 4, "start": "11:10", "end": "11:55", "period": "上午", "label": "第4节 (11:10 - 11:55)"},
        {"session": 5, "start": "13:50", "end": "14:35", "period": "下午", "label": "第5节 (13:50 - 14:35)"},
        {"session": 6, "start": "14:45", "end": "15:30", "period": "下午", "label": "第6节 (14:45 - 15:30)"},
        {"session": 7, "start": "15:40", "end": "16:25", "period": "下午", "label": "第7节 (15:40 - 16:25)"},
        {"session": 8, "start": "16:45", "end": "17:30", "period": "下午", "label": "第8节 (16:45 - 17:30)"},
        {"session": 9, "start": "17:40", "end": "18:25", "period": "下午", "label": "第9节 (17:40 - 18:25)"},
        {"session": 10, "start": "19:20", "end": "20:05", "period": "晚上", "label": "第10节 (19:20 - 20:05)"},
        {"session": 11, "start": "20:15", "end": "21:00", "period": "晚上", "label": "第11节 (20:15 - 21:00)"},
        {"session": 12, "start": "21:10", "end": "21:55", "period": "晚上", "label": "第12节 (21:10 - 21:55)"},
    ]

    @classmethod
    def get_campus_timetable(cls, campus_code: str = "03") -> List[Dict[str, Any]]:
        """根据校区代码获取四川大学官方作息时刻表 (03江安 vs 01望江/02华西)"""
        if campus_code == "03":
            return cls.SCU_TIMETABLE_JIANGAN
        return cls.SCU_TIMETABLE_WANGJIANG_HUAXI

    @classmethod
    def get_current_session_by_time(cls, campus_code: str = "03", dt: Optional[datetime.datetime] = None) -> int:
        """
        根据当前时刻及所在校区推算对应上课小节 (1~12)
        若在课间或之前则归入下一个小节，晚上课程结束后返回 0 (已下课)
        """
        if dt is None:
            dt = datetime.datetime.now()
        cur_min = dt.hour * 60 + dt.minute

        tt = cls.get_campus_timetable(campus_code)
        # 将各节次转为分钟数
        first_start = int(tt[0]["start"].split(":")[0]) * 60 + int(tt[0]["start"].split(":")[1])
        if cur_min < first_start:
            return 1

        for t in tt:
            s_end = int(t["end"].split(":")[0]) * 60 + int(t["end"].split(":")[1])
            # 下一节开始前有 10-20 分钟课间，在课间视作即将开始下一节
            if cur_min <= s_end + 5:
                return t["session"]

        last_end = int(tt[-1]["end"].split(":")[0]) * 60 + int(tt[-1]["end"].split(":")[1])
        if cur_min > last_end:
            return 0
        return 0

    def get_free_classrooms(
        self,
        campus: str = "03",
        building: str = "301",
        query_date: Optional[str] = None,
        session: Optional[int] = None,
        time_slot: Optional[str] = None,
        min_capacity: int = 0,
        only_current_free: bool = False,
    ) -> Dict[str, Any]:
        """
        获取指定校区、教学楼、日期的空闲教室与占用矩阵
        支持精确指定第几节 (1~12) 或时段 (morning, afternoon, evening, all) 筛选
        """
        # 校区标准化
        campus_code = "03"
        for c in self.SCU_CAMPUS_DICT:
            if campus in (c["code"], c["name"], c["short"]):
                campus_code = c["code"]
                break

        # 教学楼标准化
        building_code = "301" if campus_code == "03" else ("104" if campus_code == "01" else "201")
        b_list = self.SCU_BUILDINGS_DICT.get(campus_code, [])
        for b in b_list:
            if building in ([b["code"], b["name"]] + b.get("aliases", [])):
                building_code = b["code"]
                break

        # 日期默认为今天
        today_str = datetime.date.today().strftime("%Y-%m-%d")
        target_date = query_date.strip() if query_date else today_str
        is_today = (target_date == today_str)

        # 发送教务系统底层占用接口查询
        payload = {
            "xqh": campus_code,
            "jxlh": building_code,
            "searchDate": target_date,
            "jslx": "",
            "jasm": "",
            "zwFrom": str(min_capacity) if min_capacity > 0 else "",
            "zwTo": "",
        }

        resp = self.request("POST", "/student/teachingResources/classroomUseStatus/jasInfo", data=payload)
        data = resp.json()

        classrooms_raw = data.get("classrooms") or []
        times_raw = data.get("classroomTime") or []
        teaching_week = data.get("jxzc") or 1
        day_of_week = data.get("week") or 1
        res_date = data.get("date") or target_date

        # 获取当前校区的官方教学时刻表
        timetable = self.get_campus_timetable(campus_code)

        cur_realtime_session = self.get_current_session_by_time(campus_code) if is_today else 0

        # 解析用户目标筛选节次集合 (target_sessions)
        target_sessions: List[int] = []
        target_label = f"全天 (第1~12节 · {timetable[0]['start']}-{timetable[11]['end']})"

        if session is not None and 1 <= session <= 12:
            target_sessions = [session]
            t_info = timetable[session - 1]
            target_label = f"第 {session} 节 ({t_info['start']} - {t_info['end']})"
        elif time_slot == "morning":
            target_sessions = [1, 2, 3, 4]
            target_label = f"上午 (第1~4节 · {timetable[0]['start']}-{timetable[3]['end']})"
        elif time_slot == "afternoon":
            target_sessions = [5, 6, 7, 8, 9]
            target_label = f"下午 (第5~9节 · {timetable[4]['start']}-{timetable[8]['end']})"
        elif time_slot == "evening":
            target_sessions = [10, 11, 12]
            target_label = f"晚上 (第10~12节 · {timetable[9]['start']}-{timetable[11]['end']})"
        elif is_today and cur_realtime_session > 0:
            target_sessions = [cur_realtime_session]
            t_info = timetable[cur_realtime_session - 1]
            target_label = f"当前时段: 第 {cur_realtime_session} 节 ({t_info['start']} - {t_info['end']})"
        else:
            target_sessions = list(range(1, 13))
            target_label = f"全天时段 (第1~12节 · {timetable[0]['start']}-{timetable[11]['end']})"

        # 构建教室基础占用字典
        occupancy_map: Dict[str, Dict[str, Any]] = {}
        for c in classrooms_raw:
            cid = c.get("id", {})
            c_num = cid.get("classroomNumber") or c.get("classroomName") or ""
            if not c_num:
                continue
            remark = c.get("remark") or ""
            has_ac = ("空调" in remark) or ("研讨" in remark)
            occupancy_map[c_num] = {
                "name": c.get("classroomName", c_num),
                "roomNumber": c_num,
                "capacity": int(c.get("placeNum") or 0),
                "remark": remark,
                "hasAirConditioner": has_ac,
                "sessions": [True] * 12,  # True 表示空闲 (1~12节)
            }

        # 标注占用节次
        for t in times_raw:
            t_id = t.get("id", {})
            c_num = t_id.get("classroomNumber") or ""
            if c_num in occupancy_map:
                try:
                    start_jc = int(t_id.get("sessionstart") or 1)
                    continuing = int(t.get("continuingsession") or 1)
                    for s in range(start_jc, min(start_jc + continuing, 13)):
                        occupancy_map[c_num]["sessions"][s - 1] = False
                except (ValueError, TypeError):
                    continue

        # 详细分析每间教室在目标时段及全天的状态
        classroom_items = []
        base_start_session = target_sessions[0] if target_sessions else 1

        for c_num, info in occupancy_map.items():
            sess = info["sessions"]
            is_all_free = all(sess)

            # 检查在目标筛选集合内是否全部空闲
            is_target_free = all(sess[s - 1] for s in target_sessions if 1 <= s <= 12)

            # 当前实时小节是否空闲 (如果是今天)
            is_realtime_free = sess[cur_realtime_session - 1] if 1 <= cur_realtime_session <= 12 else True

            # 计算从目标起始节次起连续空闲小节数
            consecutive_free = 0
            for is_f in sess[base_start_session - 1:]:
                if is_f:
                    consecutive_free += 1
                else:
                    break

            item = {
                "name": info["name"],
                "roomNumber": info["roomNumber"],
                "capacity": info["capacity"],
                "remark": info["remark"],
                "hasAirConditioner": info["hasAirConditioner"],
                "sessions": sess,
                "isTargetFree": is_target_free,
                "isCurrentFree": is_realtime_free if is_today else is_target_free,
                "isFreeAllDay": is_all_free,
                "consecutiveFreeSessions": consecutive_free,
            }

            if only_current_free and not is_target_free:
                continue
            if min_capacity > 0 and info["capacity"] < min_capacity:
                continue

            classroom_items.append(item)

        # 排序：目标时段空闲优先，连续空闲节数降序，容量降序，教室名升序
        classroom_items.sort(
            key=lambda x: (
                1 if x["isTargetFree"] else 0,
                x["consecutiveFreeSessions"],
                x["capacity"],
                x["name"]
            ),
            reverse=True
        )

        campus_name = "江安校区"
        for c in self.SCU_CAMPUS_DICT:
            if c["code"] == campus_code:
                campus_name = c["name"]
                break

        building_name = building_code
        for b in b_list:
            if b["code"] == building_code:
                building_name = b["name"]
                break

        target_free_count = sum(1 for it in classroom_items if it["isTargetFree"])

        return {
            "campus": campus_name,
            "campusCode": campus_code,
            "building": building_name,
            "buildingCode": building_code,
            "queryDate": res_date,
            "isToday": is_today,
            "teachingWeek": teaching_week,
            "dayOfWeek": day_of_week,
            "currentRealtimeSession": cur_realtime_session,
            "selectedSession": session,
            "selectedTimeSlot": time_slot,
            "targetSessions": target_sessions,
            "targetLabel": target_label,
            "targetFreeCount": target_free_count,
            "totalClassrooms": len(occupancy_map),
            "freeNowCount": sum(1 for it in occupancy_map.values() if (it["sessions"][cur_realtime_session - 1] if 1 <= cur_realtime_session <= 12 else True)),
            "freeAllDayCount": sum(1 for it in occupancy_map.values() if all(it["sessions"])),
            "campuses": self.SCU_CAMPUS_DICT,
            "buildings": b_list,
            "timetable": timetable,
            "classrooms": classroom_items,
        }

    @staticmethod
    def score_to_gpa(score: float) -> float:
        """四川大学官方本科标准分数折算 GPA 模型"""
        if score >= 95:
            return 4.0
        elif score >= 90:
            return 3.8
        elif score >= 85:
            return 3.6
        elif score >= 80:
            return 3.2
        elif score >= 75:
            return 2.7
        elif score >= 70:
            return 2.2
        elif score >= 65:
            return 1.7
        elif score >= 60:
            return 1.0
        return 0.0

    def get_study_plan(self) -> Dict[str, Any]:
        """
        获取学生个人培养方案完成度全景与均分测算模型数据
        支持查看已完成课程、在读课程与方案待修课程，提供基准总均分与保研必修均分
        """
        # 1. 获取已完成课程（历史成绩单）
        grades_res = self.get_grades()
        all_grades = grades_res.get("grades", [])

        total_weighted_score = 0.0
        total_credit = 0.0
        req_weighted_score = 0.0
        req_credit = 0.0

        completed_courses = []
        completed_names = set()

        for g in all_grades:
            name = g.get("name", "").strip()
            completed_names.add(name)
            credit = float(g.get("credit", 0.0))
            is_req = bool(g.get("isRequired"))

            # 解析分数值
            try:
                score_val = float(g.get("rawScore") or g.get("score") or 0)
            except Exception:
                score_val = 75.0

            total_weighted_score += score_val * credit
            total_credit += credit
            if is_req:
                req_weighted_score += score_val * credit
                req_credit += credit

            gpa_val = float(g.get("gpa") or self.score_to_gpa(score_val))

            completed_courses.append({
                "id": f"comp-{len(completed_courses)}",
                "name": name,
                "credit": credit,
                "score": score_val,
                "gradeLevel": g.get("gradeLevel", ""),
                "property": g.get("property", "必修" if is_req else "选修"),
                "isRequired": is_req,
                "status": "COMPLETED",
                "term": g.get("term", ""),
                "gpa": gpa_val,
            })

        base_overall_avg = round(total_weighted_score / total_credit, 2) if total_credit > 0 else 0.0
        base_req_avg = round(req_weighted_score / req_credit, 2) if req_credit > 0 else 0.0
        base_overall_gpa = round(sum(c["gpa"] * c["credit"] for c in completed_courses) / total_credit, 2) if total_credit > 0 else 0.0
        base_req_gpa = round(sum(c["gpa"] * c["credit"] for c in completed_courses if c["isRequired"]) / req_credit, 2) if req_credit > 0 else 0.0

        # 2. 获取当前进行中修读课程（课表）
        in_progress_courses = []
        try:
            sched_res = self.get_schedule()
            curr_courses = sched_res.get("courses", [])
            for c in curr_courses:
                c_name = c.get("name", "").strip()
                if c_name not in completed_names:
                    credit = float(c.get("credit", 2.0))
                    prop = c.get("property", "必修")
                    is_req = ("必修" in prop)
                    in_progress_courses.append({
                        "id": f"prog-{len(in_progress_courses)}",
                        "name": c_name,
                        "credit": credit,
                        "score": 85.0,  # 默认预测模拟分
                        "gradeLevel": "B+",
                        "property": prop,
                        "isRequired": is_req,
                        "status": "IN_PROGRESS",
                        "term": "当前在读学期",
                        "gpa": self.score_to_gpa(85.0),
                    })
        except Exception:
            pass

        # 3. 提取方案大纲与待修读课程
        college = "物理学院"
        major = "物理学（强基计划）"
        grade_year = self.username[:4] if len(self.username) >= 4 else "2024"
        program_name = f"{major}培养方案"
        required_total_credit = 165.0

        pending_courses = []
        try:
            # 尝试从周课表页面正则提取真实学院和专业
            schedule_page = self.request("GET", "/student/personalSenate/giveLessonInfo/thisSemesterSchedule/weekLySchedule").text
            col_m = re.search(r'学院[：:]\s*([^\s<]+)', schedule_page)
            maj_m = re.search(r'专业[：:]\s*([^\s<]+)', schedule_page)
            if col_m:
                college = col_m.group(1).strip()
            if maj_m:
                major = maj_m.group(1).strip()

            # 查询方案库
            resp_load = self.session.post(
                f"{self.BASE_URL}/student/comprehensiveQuery/search/trainProgram/load",
                data={"pageNum": 1, "pageSize": 500, "nj": grade_year},
                headers=self.headers,
                timeout=8
            ).json()

            records = resp_load.get("data", {}).get("records", [])
            matched_fajhh = ""
            for rec in records:
                famc = rec.get("FAMC", "")
                zym = rec.get("ZYM", "")
                if major in famc or major in zym:
                    matched_fajhh = rec.get("FAJHH")
                    program_name = famc
                    break

            if matched_fajhh:
                resp_detail = self.session.post(
                    f"{self.BASE_URL}/student/comprehensiveQuery/search/trainProgram/detail",
                    data={"fajhh": matched_fajhh, "lx": "1"},
                    headers=self.headers,
                    timeout=8
                ).json()

                jh = resp_detail.get("jhFajhb", {})
                required_total_credit = float(jh.get("yqzxf", 165.0))
                tree = resp_detail.get("treeList", [])

                category_map = {}
                for node in tree:
                    p_id = node.get("pId")
                    n_id = node.get("id")
                    raw_name = re.sub(r'<[^>]+>', '', node.get("name", "")).strip()
                    if p_id == -1 or p_id == "-1":
                        category_map[n_id] = raw_name
                    elif node.get("urlPath") and "@" in node.get("urlPath"):
                        c_name = re.sub(r'\s*(必修|选修|限选|任选).*$', '', raw_name).strip()
                        # 若既没有修过，也不在当前课表，则视为待修读课程
                        if c_name not in completed_names and not any(p["name"] == c_name for p in in_progress_courses):
                            is_req = "必修" in raw_name
                            cat = category_map.get(p_id, "专业课程")
                            pending_courses.append({
                                "id": f"pend-{len(pending_courses)}",
                                "name": c_name,
                                "credit": 3.0,  # 默认3学分
                                "score": 85.0,  # 默认预测模拟分
                                "gradeLevel": "待修",
                                "property": "必修" if is_req else "选修",
                                "isRequired": is_req,
                                "category": cat,
                                "status": "PENDING",
                                "term": "后续学期",
                                "gpa": self.score_to_gpa(85.0),
                            })
        except Exception:
            pass

        in_progress_credits = sum(c["credit"] for c in in_progress_courses)

        return {
            "programName": program_name,
            "college": college,
            "major": major,
            "grade": f"{grade_year}级",
            "requiredTotalCredits": required_total_credit,
            "completedCredits": total_credit,
            "inProgressCredits": in_progress_credits,
            "pendingCredits": max(0.0, round(required_total_credit - total_credit - in_progress_credits, 1)),
            "baseStats": {
                "overallAvgScore": base_overall_avg,
                "overallGpa": base_overall_gpa,
                "requiredAvgScore": base_req_avg,
                "requiredGpa": base_req_gpa,
                "totalCredit": total_credit,
                "requiredCredit": req_credit,
                "totalCourses": len(completed_courses),
            },
            "completedCourses": completed_courses,
            "inProgressCourses": in_progress_courses,
            "pendingCourses": pending_courses,
        }
