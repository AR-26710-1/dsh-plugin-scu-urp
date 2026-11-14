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

    @classmethod
    def _hex_md5(cls, string: str, ver: str = "") -> str:
        """还原教务处前端 /js/md5/md5.min.js 的 hex_md5 加盐算法"""
        if ver:
            salt = "Urp602019" if ver == "v6" else ver
            string = f"{string}{{{salt}}}"
        return cls._md5_hex(string)

    @classmethod
    def encrypt_password(cls, password: str, token_value: str = "") -> str:
        """
        四川大学综合教务系统官方前端真实加密逻辑 (源自 /js/login/login.js encodePass)
        pass = hex_md5(hex_md5(pwd, 'v6'), token) + '*' + hex_md5(hex_md5(pwd, ''), token)
        """
        p1 = cls._hex_md5(cls._hex_md5(password, "v6"), token_value)
        p2 = cls._hex_md5(cls._hex_md5(password, ""), token_value)
        return f"{p1}*{p2}"

    def update_credentials(self, username: str, password: str):
        self.username = username
        self.password = password
        self.is_logged_in = False

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

                token_match = re.search(r"name=['\"]tokenValue['\"][^>]*value=['\"]([^'\"]+)['\"]", html)
                token_value = token_match.group(1) if token_match else ""

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

                # 3. 构造请求载荷与头部
                encrypted_pwd = self.encrypt_password(self.password, token_value)
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

    def get_schedule(self) -> Dict[str, Any]:
        """获取并整理个人课表数据"""
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

        courses = []
        date_list = data.get("dateList") or []
        for item in date_list:
            if not isinstance(item, dict):
                continue
            sub_list = item.get("selectCourseList") or []
            for c in sub_list:
                if not isinstance(c, dict):
                    continue
                time_places = []
                tp_list = c.get("timeAndPlaceList") or []
                for tp in tp_list:
                    if not isinstance(tp, dict):
                        continue
                    raw_bitmap = tp.get("classWeek") or ""
                    time_places.append({
                        "day": tp.get("classDay"),  # 1-7
                        "startSession": tp.get("classSessions"),  # 起始节
                        "continuingSessions": tp.get("continuingSession", 2) or 2,
                        "building": tp.get("teachingBuildingName") or "",
                        "classroom": tp.get("classroomName") or "",
                        "campus": tp.get("campusName") or "",
                        "weekDescription": tp.get("weekDescription") or "",
                        "rawWeeks": raw_bitmap,
                        "weeks": self.parse_class_weeks(raw_bitmap) if raw_bitmap else [],
                    })

                cid = c.get("id") or {}
                if isinstance(cid, dict):
                    c_num = cid.get("coureNumber") or ""
                    c_seq = cid.get("coureSequenceNumber") or ""
                else:
                    c_num = ""
                    c_seq = ""

                courses.append({
                    "name": c.get("courseName") or "",
                    "courseNumber": c_num,
                    "unitNumber": c_seq,
                    "property": c.get("coursePropertiesName") or "",
                    "teacher": (c.get("attendClassTeacher") or "").rstrip("*"),
                    "credit": float(c.get("unit") or 0.0),
                    "schedules": time_places,
                })

        return {
            "semesterId": semester_id,
            "totalCourses": len(courses),
            "courses": courses,
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

    @staticmethod
    def get_current_session_by_time(dt: Optional[datetime.datetime] = None) -> int:
        """
        根据当前时刻推算川大对应上课小节 (1~12)
        若在课间或之前则归入下一个小节，22:00 之后返回 0 (已下课)
        """
        if dt is None:
            dt = datetime.datetime.now()
        cur_min = dt.hour * 60 + dt.minute

        # 节次开始与结束时间映射 (分钟数)
        # 1: 08:15(495)-09:00(540), 2: 09:10(550)-09:55(595)
        # 3: 10:15(615)-11:00(660), 4: 11:10(670)-11:55(715)
        # 5: 13:50(830)-14:35(875)
        # 6: 14:45(885)-15:30(930), 7: 15:40(940)-16:25(985)
        # 8: 16:45(1005)-17:30(1050), 9: 17:40(1060)-18:25(1105)
        # 10: 19:30(1170)-20:15(1215), 11: 20:25(1225)-21:10(1270)
        # 12: 21:15(1275)-22:00(1320)
        session_ends = [
            (1, 545),    # 09:05 前视为第 1 节
            (2, 605),    # 10:05 前视为第 2 节
            (3, 665),    # 11:05 前视为第 3 节
            (4, 730),    # 12:10 前视为第 4 节
            (5, 880),    # 14:40 前视为第 5 节
            (6, 935),    # 15:35 前视为第 6 节
            (7, 995),    # 16:35 前视为第 7 节
            (8, 1055),   # 17:35 前视为第 8 节
            (9, 1120),   # 18:40 前视为第 9 节
            (10, 1220),  # 20:20 前视为第 10 节
            (11, 1272),  # 21:12 前视为第 11 节
            (12, 1320),  # 22:00 前视为第 12 节
        ]
        if cur_min < 495:
            return 1
        for s_idx, s_end in session_ends:
            if cur_min <= s_end:
                return s_idx
        return 0

    def get_free_classrooms(
        self,
        campus: str = "03",
        building: str = "301",
        query_date: Optional[str] = None,
        min_capacity: int = 0,
        only_current_free: bool = False,
    ) -> Dict[str, Any]:
        """
        获取指定校区、教学楼、日期的空闲教室与占用矩阵
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

        # 计算当前节次 (若查询的是今天，按当前时间算；若不是今天，默认 1)
        is_today = (target_date == today_str)
        cur_session = self.get_current_session_by_time() if is_today else 1

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

        # 详细分析每间教室的状态
        classroom_items = []
        for c_num, info in occupancy_map.items():
            sess = info["sessions"]
            is_all_free = all(sess)
            # 当前节次是否空闲
            is_cur_free = sess[cur_session - 1] if 1 <= cur_session <= 12 else True
            # 今日剩余节次是否全空闲
            rest_sessions = sess[cur_session - 1:] if 1 <= cur_session <= 12 else sess
            is_rest_free = all(rest_sessions) if rest_sessions else True

            # 计算从当前节起连续空闲小节数
            consecutive_free = 0
            if 1 <= cur_session <= 12:
                for is_f in sess[cur_session - 1:]:
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
                "isCurrentFree": is_cur_free,
                "isFreeAllDay": is_all_free,
                "isFreeRestOfDay": is_rest_free,
                "consecutiveFreeSessions": consecutive_free,
            }

            if only_current_free and not is_cur_free:
                continue
            if min_capacity > 0 and info["capacity"] < min_capacity:
                continue

            classroom_items.append(item)

        # 排序：优先按连续空闲节数降序，次按容量降序，再按名字升序
        classroom_items.sort(
            key=lambda x: (
                1 if x["isCurrentFree"] else 0,
                x["consecutiveFreeSessions"],
                x["capacity"],
                x["name"]
            ),
            reverse=True
        )

        # 找到当前选中的教学楼名称与校区名称
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

        return {
            "campus": campus_name,
            "campusCode": campus_code,
            "building": building_name,
            "buildingCode": building_code,
            "queryDate": res_date,
            "isToday": is_today,
            "teachingWeek": teaching_week,
            "dayOfWeek": day_of_week,
            "currentSession": cur_session,
            "totalClassrooms": len(occupancy_map),
            "freeNowCount": sum(1 for it in occupancy_map.values() if (it["sessions"][cur_session - 1] if 1 <= cur_session <= 12 else True)),
            "freeAllDayCount": sum(1 for it in occupancy_map.values() if all(it["sessions"])),
            "campuses": self.SCU_CAMPUS_DICT,
            "buildings": b_list,
            "classrooms": classroom_items,
        }
