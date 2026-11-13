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
    def encrypt_password(password: str) -> str:
        """教务处双重 MD5 加密逻辑"""
        first = hashlib.md5(password.encode("utf-8")).hexdigest()
        return hashlib.md5(first.encode("utf-8")).hexdigest()

    def update_credentials(self, username: str, password: str):
        self.username = username
        self.password = password
        self.is_logged_in = False

    def login(self, max_retries: int = 3) -> Tuple[bool, str]:
        """
        执行教务系统登录流程，带验证码重试
        """
        if not self.username or not self.password:
            return False, "学号或密码为空"

        for attempt in range(1, max_retries + 1):
            try:
                # 1. 获取登录页并抽取 token 与 hidden 字段
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

                # 2. 获取验证码图片
                captcha_url = f"{self.BASE_URL}/captcha/generate?_={self.session.cookies.get('JSESSIONID', '')}"
                captcha_resp = self.session.get(captcha_url, timeout=12)

                if self.ocr is None:
                    return False, "未安装或无法加载 ddddocr 识别引擎"

                captcha_code = self.ocr.classification(captcha_resp.content).strip()

                # 3. 提交登录表单
                payload = {
                    "j_username": self.username,
                    "j_password": self.encrypt_password(self.password),
                    "j_captcha": captcha_code,
                    "tokenValue": token_value,
                    **hidden_inputs,
                }

                login_resp = self.session.post(
                    f"{self.BASE_URL}/j_spring_security_check",
                    data=payload,
                    headers=self.headers,
                    allow_redirects=True,
                    timeout=15,
                )

                resp_text = login_resp.text
                if "退出系统" in resp_text or "/student/" in login_resp.url:
                    self.is_logged_in = True
                    # 尝试从主界面抽取学生姓名
                    name_match = re.search(r'class="userName"[^>]*>([^<]+)<', resp_text)
                    if name_match:
                        self.student_name = name_match.group(1).strip()
                    return True, "登录成功"

                if "验证码错误" in resp_text or "验证码" in resp_text:
                    if attempt < max_retries:
                        continue
                    return False, "验证码识别错误，重试超限"

                if "用户名或密码错误" in resp_text:
                    return False, "用户名或密码错误，请检查学号与密码"

                if "token校验失败" in resp_text:
                    continue

            except Exception as e:
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
        date_list = data.get("dateList", [])
        for item in date_list:
            sub_list = item.get("selectCourseList", [])
            for c in sub_list:
                time_places = []
                for tp in c.get("timeAndPlaceList", []):
                    raw_bitmap = tp.get("classWeek", "")
                    time_places.append({
                        "day": tp.get("classDay"),  # 1-7
                        "startSession": tp.get("classSessions"),  # 起始节
                        "continuingSessions": tp.get("continuingSession", 2),
                        "building": tp.get("teachingBuildingName", ""),
                        "classroom": tp.get("classroomName", ""),
                        "rawWeeks": raw_bitmap,
                        "weeks": self.parse_class_weeks(raw_bitmap),
                    })

                courses.append({
                    "name": c.get("courseName", ""),
                    "courseNumber": c.get("courseNumber", ""),
                    "unitNumber": c.get("unitNumber", ""),
                    "property": c.get("coursePropertiesName", ""),
                    "teacher": c.get("attendClassTeacher", ""),
                    "credit": float(c.get("unitCredit", 0.0) or 0.0),
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

        raw_data = self.request("GET", f"/student/integratedQuery/scoreQuery/{token}/allTermScores/data").json()
        raw_list = raw_data.get("list", []) if isinstance(raw_data, dict) else (raw_data if isinstance(raw_data, list) else [])

        formatted_grades = []
        total_credit = 0.0
        weighted_gpa_sum = 0.0
        weighted_score_sum = 0.0
        score_credit_sum = 0.0
        terms = set()

        for g in raw_list:
            kcm = g.get("KCM", "")
            kch = g.get("KCH", "")
            credit = float(g.get("XF") or 0.0)
            score = str(g.get("KCCJ") or "")
            djm = g.get("DJM", "") or ""
            term = g.get("ZXJXJHM", "")
            prop = g.get("KCXZMC", "")

            if term:
                terms.add(term)

            gpa = self.calculate_gpa(score, djm)

            formatted_grades.append({
                "name": kcm,
                "code": kch,
                "term": term,
                "credit": credit,
                "score": score,
                "gradeLevel": djm,
                "property": prop,
                "gpa": gpa,
            })

            if credit > 0:
                total_credit += credit
                weighted_gpa_sum += gpa * credit
                try:
                    num_score = float(score)
                    weighted_score_sum += num_score * credit
                    score_credit_sum += credit
                except ValueError:
                    pass

        avg_gpa = round(weighted_gpa_sum / total_credit, 2) if total_credit > 0 else 0.0
        avg_score = round(weighted_score_sum / score_credit_sum, 2) if score_credit_sum > 0 else 0.0

        return {
            "totalCourses": len(formatted_grades),
            "totalCredit": round(total_credit, 1),
            "overallGpa": avg_gpa,
            "overallAvgScore": avg_score,
            "terms": sorted(list(terms), reverse=True),
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

        if isinstance(data, dict) and data.get("status") == "203":
            return {"totalExams": 0, "exams": [], "message": "当前区间暂无已排定的考试安排"}

        exam_list = data if isinstance(data, list) else data.get("list", [])
        results = []
        for e in exam_list:
            results.append({
                "courseName": e.get("kcm", "") or e.get("title", ""),
                "examTime": e.get("kssj", "") or f"{e.get('start', '')} ~ {e.get('end', '')}",
                "location": e.get("ksdd", "") or e.get("place", ""),
                "seatNumber": e.get("zwh", ""),
                "status": e.get("status", ""),
            })

        return {
            "totalExams": len(results),
            "exams": results,
        }
