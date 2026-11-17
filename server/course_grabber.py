"""
四川大学教务系统 (URP) 课程检索与智能抢课后端核心引擎
整合自 SCU-CourseGrabber 核心业务逻辑，为 DeepSeek Harness 插件提供：
- 全阶段选课支持 (培养方案选课 / 校级公选 / 院系选课 / 自由选课)
- 动态安全 Token 提取与 ddddocr 本地验证码识别
- 课程名 Unicode 十进制逗号拼接编码
- 提交结果二次核实防误报机制 (verify_enrollment)
- 独立后台守护线程轮询与高频限流防护 (Sleep + Jitter 抖动)
- 互斥备选组联动 (Group ID 同组一门成功其余自动取消)
- 连续失败安全熔断机制 (防死循环导致封号)
- 环形增量日志队列与任务持久化
"""
import collections
import datetime
import json
import logging
import os
import random
import re
import sys
import threading
import time
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import requests

try:
    import ddddocr
except ImportError:
    ddddocr = None

logger = logging.getLogger("CourseGrabber")

BASE_URL = "http://zhjw.scu.edu.cn"
COURSE_SELECT_URL = f"{BASE_URL}/student/courseSelect/courseSelect/index"
FREE_COURSE_SELECT_URL = f"{BASE_URL}/student/courseSelect/freeCourse/courseList"
PLAN_COURSE_SELECT_URL = f"{BASE_URL}/student/courseSelect/planCourse/courseList"
DEPART_COURSE_SELECT_URL = f"{BASE_URL}/student/courseSelect/departCourse/courseList"
SCHOOL_COURSE_SELECT_URL = f"{BASE_URL}/student/courseSelect/schoolCourse/courseList"
COURSE_SUBMIT_URL = f"{BASE_URL}/student/courseSelect/selectCourse/checkInputCodeAndSubmit"
YZM_PIC_URL = f"{BASE_URL}/student/courseSelect/selectCourse/getYzmPic.jpg"

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "X-Requested-With": "XMLHttpRequest",
    "Referer": COURSE_SELECT_URL,
}

PHASE_META = {
    "free": {
        "id": "free",
        "name": "自由选课(补退选)",
        "dealType": "5",
        "url": FREE_COURSE_SELECT_URL,
        "listKey": "rwRxkZlList",
        "needMajorId": False,
    },
    "plan": {
        "id": "plan",
        "name": "培养方案选课",
        "dealType": "2",
        "url": PLAN_COURSE_SELECT_URL,
        "listKey": "rwfalist",
        "needMajorId": True,
    },
    "depart": {
        "id": "depart",
        "name": "院系课程",
        "dealType": "4",
        "url": DEPART_COURSE_SELECT_URL,
        "listKey": "rwXirxkZlList",
        "needMajorId": True,
    },
    "school": {
        "id": "school",
        "name": "校级公选课",
        "dealType": "3",
        "url": SCHOOL_COURSE_SELECT_URL,
        "listKey": "rwXarxkZlList",
        "needMajorId": False,
    },
}


class GrabStatus(str, Enum):
    WAITING = "WAITING"        # 等待中
    GRABBING = "GRABBING"      # 抢课轮询中
    SUCCESS = "SUCCESS"        # 已成功抢到
    FAILED = "FAILED"          # 失败 (达上限熔断或不可选)
    CANCELLED = "CANCELLED"    # 已取消 (手动取消或备选组同组触发)


@dataclass
class CourseItem:
    course_id: str           # kch 课程号
    seq_no: str              # kxh 课序号
    name: str                # kcm 课程名称
    teacher: str = ""        # skjs 教师
    seats_free: int = 0      # bkskyl 本科生课余量
    capacity: int = 0        # 课容量
    classroom: str = ""      # jasm 上课地点
    plan_id: str = ""        # zxjxjhh / termCode 执行教学计划号
    schedule: str = ""       # 整理后的格式化时间描述
    credit: float = 0.0      # xf 学分
    campus: str = ""         # xq 校区
    course_category: str = ""# kclbmc 课程类别
    restriction: str = ""    # xkxzsm 选课限制说明
    raw: dict = field(default_factory=dict)

    @property
    def kc_id(self) -> str:
        """全局唯一标识: 课程号_课序号_计划号"""
        if self.plan_id:
            return f"{self.course_id}_{self.seq_no}_{self.plan_id}"
        return f"{self.course_id}_{self.seq_no}"

    @property
    def display_id(self) -> str:
        return f"{self.course_id}_{self.seq_no}"

    @classmethod
    def from_raw(cls, raw: dict) -> "CourseItem":
        # 兼容不同接口返回的字段大小写
        c_id = str(raw.get("kch") or raw.get("KCH") or raw.get("courseNum") or "").strip()
        c_seq = str(raw.get("kxh") or raw.get("KXH") or raw.get("classNum") or "").strip()
        name = str(raw.get("kcm") or raw.get("KCM") or "").strip()
        teacher = str(raw.get("skjs") or raw.get("SKJS") or "").strip().rstrip("*")

        # 课余量与容量解析
        try:
            free = int(raw.get("bkskyl") or raw.get("BKSKYL") or 0)
        except (ValueError, TypeError):
            free = 0

        try:
            cap = int(raw.get("bkskrl") or raw.get("BKSKRL") or 0)
        except (ValueError, TypeError):
            cap = 0

        try:
            credit = float(raw.get("xf") or raw.get("XF") or 0.0)
        except (ValueError, TypeError):
            credit = 0.0

        classroom = str(raw.get("jasm") or raw.get("JASM") or "").strip()
        plan_id = str(raw.get("zxjxjhh") or raw.get("ZXJXJHH") or raw.get("termCode") or "").strip()
        campus = str(raw.get("xq") or raw.get("XQ") or raw.get("campusName") or "").strip()
        cat = str(raw.get("kclbmc") or raw.get("KCLBMC") or "").strip()
        restriction = str(raw.get("xkxzsm") or raw.get("XKXZSM") or "").strip()

        # 上课时间格式化解析
        schedule = ""
        day = raw.get("skxq") or raw.get("SKXQ") or ""
        start = raw.get("skjc") or raw.get("SKJC") or ""
        cont = raw.get("cxjc") or raw.get("CXJC") or ""
        weeks = raw.get("zcsm") or raw.get("ZCSM") or ""
        if day and start:
            day_map = {"1": "周一", "2": "周二", "3": "周三", "4": "周四", "5": "周五", "6": "周六", "7": "周日"}
            day_name = day_map.get(str(day), f"周{day}")
            try:
                duration = int(str(cont)) if cont else 1
                end = int(str(start)) + duration - 1
                schedule = f"{day_name} 第{start}-{end}节 {weeks}".strip()
            except Exception:
                schedule = f"{day_name} 第{start}节 {weeks}".strip()

        return cls(
            course_id=c_id,
            seq_no=c_seq,
            name=name,
            teacher=teacher,
            seats_free=free,
            capacity=cap,
            classroom=classroom,
            plan_id=plan_id,
            schedule=schedule,
            credit=credit,
            campus=campus,
            course_category=cat,
            restriction=restriction,
            raw=raw,
        )


@dataclass
class GrabTask:
    course: CourseItem
    status: GrabStatus = GrabStatus.WAITING
    group_id: int = 0          # 0 表示独立抢课; >0 表示同组备选 (同组任意一门抢中其余自动取消)
    attempts: int = 0          # 尝试轮询次数
    last_message: str = ""     # 最近一次执行结果描述
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    @property
    def kc_id(self) -> str:
        return self.course.kc_id


@dataclass
class GrabConfig:
    sleep_time: float = 2.0        # 轮询基础等待秒数
    sleep_jitter: float = 0.5      # 抖动随机浮动秒数
    max_failures: int = 5          # 单门课程连续提交失败上限（熔断）
    phase: str = "free"            # 默认选课批次 (free, plan, depart, school)
    major_id: str = ""             # 专业方案计划号 (fajhh)
    scheduled_time: str = ""       # 定时开抢时间 (如 "13:00:00" 或 "2026-09-18 13:00:00")


class CourseGrabberManager:
    """选课与智能抢课业务管理器（单例）"""

    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.tasks_file = os.path.join(data_dir, "grab_tasks.json")
        self.config_file = os.path.join(data_dir, "grab_config.json")

        self._lock = threading.RLock()
        self.tasks: List[GrabTask] = []
        self.config = GrabConfig()

        # 环形实时日志队列 (最新 300 条)
        self._logs = collections.deque(maxlen=300)
        self._log_counter = 0
        # SSE 日志订阅客户端列表: [(asyncio.Queue, asyncio.AbstractEventLoop)]
        self._subscribers: List[Tuple[Any, Any]] = []

        # 后台抢课线程控制
        self._worker_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.is_running = False
        self.start_time: Optional[float] = None
        self.total_attempts: int = 0
        self.success_count: int = 0

        # 定时开抢调度控制 (毫秒级精度)
        self.scheduled_epoch: Optional[float] = None
        self.is_scheduled_waiting: bool = False

        # OCR 引擎实例缓存
        self._ocr = None

        self._load_config()
        self._load_tasks()

    @property
    def ocr(self):
        """懒加载本地 ddddocr 引擎并抑制控制台标准输出"""
        if self._ocr is None and ddddocr is not None:
            import io
            old_stdout = sys.stdout
            try:
                sys.stdout = io.StringIO()
                self._ocr = ddddocr.DdddOcr(show_ad=False)
            finally:
                sys.stdout = old_stdout
        return self._ocr

    def subscribe_logs(self, queue, loop):
        """注册 SSE 实时日志推送队列"""
        with self._lock:
            self._subscribers.append((queue, loop))

    def unsubscribe_logs(self, queue):
        """移除已断开连接的 SSE 队列"""
        with self._lock:
            self._subscribers = [(q, l) for q, l in self._subscribers if q != queue]

    def add_log(self, level: str, message: str):
        """向环形队列投递结构化日志，并通过 SSE 实时广播给所有在线前端客户端"""
        with self._lock:
            self._log_counter += 1
            now_str = datetime.datetime.now().strftime("%H:%M:%S")
            log_item = {
                "id": self._log_counter,
                "time": now_str,
                "level": level.upper(),  # DEBUG, INFO, SUCCESS, WARNING, ERROR
                "message": message,
            }
            self._logs.append(log_item)
            logger.info(f"[{log_item['level']}] {message}")

            # 实时分发给 SSE 订阅队列
            for q, loop in list(self._subscribers):
                try:
                    if loop.is_running():
                        loop.call_soon_threadsafe(q.put_nowait, log_item)
                except Exception:
                    pass

    def get_logs(self, since_id: int = 0) -> List[Dict[str, Any]]:
        """获取序列号大于 since_id 的增量日志"""
        with self._lock:
            if since_id <= 0:
                return list(self._logs)
            return [l for l in self._logs if l["id"] > since_id]

    @staticmethod
    def parse_scheduled_epoch(time_str: str) -> Optional[float]:
        """
        解析定时开抢时间字符串为未来目标时间戳 (秒+毫秒)。
        支持 '13:00:00', '13:00:00.000', '2026-09-18 13:00:00' 等格式。
        若仅输入时分秒且已过去超过 10 分钟，自动顺延至明天。
        """
        if not time_str or not time_str.strip():
            return None
        s = time_str.strip()
        now = datetime.datetime.now()

        # 格式 1: 完整日期时间
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
            try:
                dt = datetime.datetime.strptime(s, fmt)
                return dt.timestamp()
            except ValueError:
                pass

        # 格式 2: 当天时刻 'HH:MM:SS' 或 'HH:MM:SS.fff'
        for fmt in ("%H:%M:%S.%f", "%H:%M:%S"):
            try:
                t_part = datetime.datetime.strptime(s, fmt).time()
                target_dt = datetime.datetime.combine(now.date(), t_part)
                # 若当前时间已经超过目标时间 10 分钟以上，视为明天该时刻
                if (target_dt.timestamp() - now.timestamp()) < -600:
                    target_dt += datetime.timedelta(days=1)
                return target_dt.timestamp()
            except ValueError:
                pass

        return None

    def set_scheduled_time(self, time_str: str, urp_client) -> Tuple[bool, str, Dict[str, Any]]:
        """设置定时开抢并启动待命"""
        with self._lock:
            if not time_str.strip():
                return False, "定时开抢时间不能为空", {}
            epoch = self.parse_scheduled_epoch(time_str)
            if not epoch:
                return False, "时间格式无效，请使用 '13:00:00' 或 'YYYY-MM-DD HH:MM:SS'", {}

            now = time.time()
            diff = epoch - now
            if diff <= 0:
                return False, "设定的时间已成为过去，请指定未来的时间点", {}

            self.config.scheduled_time = time_str.strip()
            self.scheduled_epoch = epoch
            self.save_config()

            target_str = datetime.datetime.fromtimestamp(epoch).strftime("%Y-%m-%d %H:%M:%S")
            self.add_log("INFO", f"⏰ 已设定定时开抢: {target_str} (倒计时: {int(diff)} 秒)")

            # 若引擎未在运行，自动拉起引擎进入定时待命模式
            if not self.is_running:
                ok, msg = self.start_engine(urp_client)
                if not ok:
                    return False, msg, {}

            return True, f"定时开抢已就绪，将在 {target_str} 准点开抢", self.get_scheduled_status()

    def cancel_scheduled(self) -> Tuple[bool, str]:
        """取消定时开抢计划"""
        with self._lock:
            self.config.scheduled_time = ""
            self.scheduled_epoch = None
            self.is_scheduled_waiting = False
            self.save_config()
            self.add_log("WARNING", "已取消定时开抢计划")
            return True, "已成功取消定时开抢"

    def get_scheduled_status(self) -> Dict[str, Any]:
        """获取当前定时开抢详细状态"""
        with self._lock:
            has_scheduled = bool(self.scheduled_epoch and self.scheduled_epoch > 0)
            remaining_sec = max(0.0, self.scheduled_epoch - time.time()) if has_scheduled else 0.0
            target_str = datetime.datetime.fromtimestamp(self.scheduled_epoch).strftime("%Y-%m-%d %H:%M:%S") if has_scheduled else ""

            return {
                "hasScheduled": has_scheduled,
                "scheduledTime": self.config.scheduled_time,
                "targetDateTime": target_str,
                "remainingSeconds": round(remaining_sec, 2),
                "isWaiting": self.is_scheduled_waiting,
                "formattedCountdown": str(datetime.timedelta(seconds=int(remaining_sec))) if has_scheduled else "",
            }

    def _load_config(self):
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, "r", encoding="utf-8") as f:
                    d = json.load(f)
                    sch_time = str(d.get("scheduled_time", ""))
                    self.config = GrabConfig(
                        sleep_time=float(d.get("sleep_time", 2.0)),
                        sleep_jitter=float(d.get("sleep_jitter", 0.5)),
                        max_failures=int(d.get("max_failures", 5)),
                        phase=str(d.get("phase", "free")),
                        major_id=str(d.get("major_id", "")),
                        scheduled_time=sch_time,
                    )
                    if sch_time:
                        self.scheduled_epoch = self.parse_scheduled_epoch(sch_time)
        except Exception as e:
            logger.warning(f"加载抢课配置失败: {e}")

    def save_config(self, new_cfg: Optional[GrabConfig] = None):
        if new_cfg:
            self.config = new_cfg
        try:
            os.makedirs(self.data_dir, exist_ok=True)
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(asdict(self.config), f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"保存抢课配置失败: {e}")

    def _load_tasks(self):
        try:
            if os.path.exists(self.tasks_file):
                with open(self.tasks_file, "r", encoding="utf-8") as f:
                    raw_list = json.load(f)
                    loaded = []
                    for item in raw_list:
                        c_dict = item.get("course", {})
                        course = CourseItem(
                            course_id=c_dict.get("course_id", ""),
                            seq_no=c_dict.get("seq_no", ""),
                            name=c_dict.get("name", ""),
                            teacher=c_dict.get("teacher", ""),
                            seats_free=int(c_dict.get("seats_free", 0)),
                            capacity=int(c_dict.get("capacity", 0)),
                            classroom=c_dict.get("classroom", ""),
                            plan_id=c_dict.get("plan_id", ""),
                            schedule=c_dict.get("schedule", ""),
                            credit=float(c_dict.get("credit", 0.0)),
                            campus=c_dict.get("campus", ""),
                            course_category=c_dict.get("course_category", ""),
                            restriction=c_dict.get("restriction", ""),
                            raw=c_dict.get("raw", {}),
                        )
                        st_str = item.get("status", "WAITING")
                        # 如果退出前正在抢课，恢复为等待中
                        if st_str == "GRABBING":
                            st_str = "WAITING"
                        task = GrabTask(
                            course=course,
                            status=GrabStatus(st_str),
                            group_id=int(item.get("group_id", 0)),
                            attempts=int(item.get("attempts", 0)),
                            last_message=str(item.get("last_message", "")),
                            created_at=float(item.get("created_at", time.time())),
                            updated_at=float(item.get("updated_at", time.time())),
                        )
                        loaded.append(task)
                    self.tasks = loaded
        except Exception as e:
            logger.warning(f"加载抢课任务队列失败: {e}")

    def save_tasks(self):
        with self._lock:
            try:
                os.makedirs(self.data_dir, exist_ok=True)
                serialized = []
                for t in self.tasks:
                    serialized.append({
                        "course": asdict(t.course),
                        "status": t.status.value,
                        "group_id": t.group_id,
                        "attempts": t.attempts,
                        "last_message": t.last_message,
                        "created_at": t.created_at,
                        "updated_at": t.updated_at,
                    })
                with open(self.tasks_file, "w", encoding="utf-8") as f:
                    json.dump(serialized, f, ensure_ascii=False, indent=2)
            except Exception as e:
                logger.error(f"持久化抢课队列异常: {e}")

    # ================== 选课底层 API 交互能力 ==================

    @staticmethod
    def encode_course_name(name_with_seq: str) -> str:
        """
        四川大学教务处 checkInputCodeAndSubmit 核心算法:
        将 '课程名_课序号' 每个字符转化为 Unicode 十进制字符码并用英文逗号拼接
        """
        return ",".join(str(ord(ch)) for ch in name_with_seq)

    def extract_token_from_page(self, session: requests.Session) -> str:
        """从选课主页抓取 32 位动态 security tokenValue"""
        try:
            resp = session.get(COURSE_SELECT_URL, headers=HTTP_HEADERS, timeout=12)
            html = resp.text
            idx = html.find('id="tokenValue"')
            if idx == -1:
                idx = html.find('name="tokenValue"')
            if idx != -1:
                val_m = re.search(r'value=["\']([a-zA-Z0-9]{32})["\']', html[max(0, idx - 20) : idx + 80])
                if val_m:
                    return val_m.group(1)
                # 兼容旧式切片
                return html[idx + 23 : idx + 55].strip('"\'> ')
            raise RuntimeError("选课页面未找到动态 tokenValue 标识")
        except Exception as e:
            raise RuntimeError(f"提取选课页面安全 Token 失败: {e}")

    def fetch_major_id(self, session: requests.Session, auto_save: bool = True) -> Optional[str]:
        """从选课主页或个人信息中探测并自动更新方案计划号 (fajhh)"""
        try:
            resp = session.get(COURSE_SELECT_URL, headers=HTTP_HEADERS, timeout=12)
            html = resp.text
            patterns = [
                r"fajhh=(\d+)",
                r"name[\"']fajhh[\"']\s+value[\"'](\d+)[\"']",
                r"value[\"'](\d+)[\"']\s+name[\"']fajhh[\"']",
                r"fajhh\s*=\s*[\"'](\d+)[\"']",
                r"fajhh[\"']?\s*:\s*[\"']?(\d+)[\"']?",
            ]
            for pat in patterns:
                m = re.search(pat, html)
                if m:
                    fajhh = m.group(1)
                    if auto_save and fajhh:
                        self.config.major_id = fajhh
                        self.save_config()
                    return fajhh
        except Exception as e:
            logger.warning(f"自动抓取专业计划号异常: {e}")
        return self.config.major_id or None

    def search_courses(
        self,
        session: requests.Session,
        keyword: str,
        phase: str = "free",
        major_id: str = "",
    ) -> List[CourseItem]:
        """
        按关键词、选课批次和专业号检索可用课程
        支持纯数字课程号 (kch) 精准检索，以及课程名称 (kcm) 模糊搜索
        """
        clean_kw = keyword.strip()
        if not clean_kw:
            return []

        meta = PHASE_META.get(phase, PHASE_META["free"])
        fajhh = major_id.strip() or self.config.major_id or ""

        # 构造查询载荷
        payload = {
            "kkxsh": "",
            "kch": clean_kw if clean_kw.replace(" ", "").isdigit() else "",
            "kcm": "" if clean_kw.replace(" ", "").isdigit() else clean_kw,
            "skjs": "",
            "kclbdm": "",
            "xq": "0",
            "jc": "0",
        }
        if meta["needMajorId"] and fajhh:
            payload["fajhh"] = fajhh

        # 确保已先进入选课主页就绪
        try:
            session.get(COURSE_SELECT_URL, headers=HTTP_HEADERS, timeout=10)
        except Exception:
            pass

        try:
            resp = session.post(meta["url"], data=payload, headers=HTTP_HEADERS, timeout=15)
        except Exception as e:
            raise RuntimeError(f"请求课程列表网络异常: {e}")

        if resp.status_code != 200:
            if "login" in resp.url or resp.status_code in (302, 401):
                raise RuntimeError("教务系统会话已过期，请重新登录")
            raise RuntimeError(f"课程列表接口返回状态码 {resp.status_code}")

        raw_text = resp.text.strip()
        if not raw_text or "login" in raw_text[:300]:
            raise RuntimeError("获取课程列表失败，响应可能重定向至登录页")

        try:
            data = json.loads(raw_text)
        except Exception:
            raise RuntimeError("课程列表响应格式异常，非合法的 JSON 数据")

        list_key = meta["listKey"]
        raw_list = data.get(list_key, []) if isinstance(data, dict) else []
        if isinstance(raw_list, str):
            try:
                raw_list = json.loads(raw_list)
            except Exception:
                raw_list = []

        if not isinstance(raw_list, list):
            raw_list = []

        results = [CourseItem.from_raw(item) for item in raw_list if isinstance(item, dict)]

        # 如果是按关键词模糊搜，且接口返回全量时做本地双重过滤
        if not clean_kw.replace(" ", "").isdigit():
            kw_low = clean_kw.lower()
            results = [
                c for c in results
                if kw_low in c.name.lower() or kw_low in c.teacher.lower() or kw_low in c.course_id.lower()
            ]

        return results

    def verify_enrollment(self, session: requests.Session, course: CourseItem) -> bool:
        """
        防 BUG-01 误报核心机制:
        提交选课返回 'ok' 后，重新查询已选课程列表 (yxkclist)，
        必须确认 selectCourseStatusCode == '001' (选中状态) 才判定真正抢到
        """
        try:
            payload = {
                "kkxsh": "",
                "kch": "",
                "kcm": "",
                "skjs": "",
                "kclbdm": "",
                "xq": "0",
                "jc": "0",
            }
            resp = session.post(FREE_COURSE_SELECT_URL, data=payload, headers=HTTP_HEADERS, timeout=10)
            if resp.status_code != 200:
                return False

            data = json.loads(resp.text)
            raw_selected = data.get("yxkclist", "")
            if isinstance(raw_selected, str) and raw_selected:
                selected_list = json.loads(raw_selected)
            elif isinstance(raw_selected, list):
                selected_list = raw_selected
            else:
                return False

            for item in selected_list:
                id_obj = item.get("id", {})
                if isinstance(id_obj, dict):
                    c_num = str(id_obj.get("coureNumber") or "")
                    c_seq = str(id_obj.get("coureSequenceNumber") or "")
                else:
                    c_num = str(item.get("coureNumber") or "")
                    c_seq = str(item.get("coureSequenceNumber") or "")

                status_code = str(item.get("selectCourseStatusCode") or "")
                if c_num == course.course_id and c_seq == course.seq_no and status_code == "001":
                    return True
        except Exception as e:
            logger.warning(f"二次校验已选课程异常: {e}")
        return False

    def get_selected_courses(self, session: requests.Session) -> List[Dict[str, Any]]:
        """获取当前已成功选修的全部课程列表（用于周课表冲突排查与对照）"""
        try:
            payload = {
                "kkxsh": "",
                "kch": "",
                "kcm": "",
                "skjs": "",
                "kclbdm": "",
                "xq": "0",
                "jc": "0",
            }
            resp = session.post(FREE_COURSE_SELECT_URL, data=payload, headers=HTTP_HEADERS, timeout=12)
            if resp.status_code != 200:
                return []
            data = json.loads(resp.text)
            raw_selected = data.get("yxkclist", "")
            if isinstance(raw_selected, str) and raw_selected:
                selected_list = json.loads(raw_selected)
            elif isinstance(raw_selected, list):
                selected_list = raw_selected
            else:
                return []

            results = []
            for item in selected_list:
                if not isinstance(item, dict):
                    continue
                id_obj = item.get("id", {})
                if isinstance(id_obj, dict):
                    c_num = str(id_obj.get("coureNumber") or "")
                    c_seq = str(id_obj.get("coureSequenceNumber") or "")
                else:
                    c_num = str(item.get("coureNumber") or "")
                    c_seq = str(item.get("coureSequenceNumber") or "")

                results.append({
                    "courseId": c_num,
                    "seqNo": c_seq,
                    "name": str(item.get("courseName") or ""),
                    "teacher": str(item.get("attendClassTeacher") or "").rstrip("*"),
                    "credit": float(item.get("unit") or 0.0),
                    "status": str(item.get("selectCourseStatusCode") or ""),
                    "statusName": "已选中" if str(item.get("selectCourseStatusCode") or "") == "001" else "处理中",
                    "raw": item,
                })
            return results
        except Exception as e:
            logger.error(f"获取已选课程列表异常: {e}")
            return []

    def attempt_single_grab(
        self,
        session: requests.Session,
        course: CourseItem,
        token: str,
        phase: str = "free",
    ) -> Tuple[bool, str]:
        """
        执行单次选课提交：
        1. 获取验证码图片并识别
        2. 字符 Unicode 编码
        3. 发起 POST 提交
        4. 二次核查验证
        返回: (是否真正成功, 结果描述)
        """
        meta = PHASE_META.get(phase, PHASE_META["free"])
        deal_type = meta["dealType"]

        # 1. 获取选课验证码图片并识别
        try:
            ts = int(time.time() * 1000)
            captcha_resp = session.get(f"{YZM_PIC_URL}?_={ts}", headers=HTTP_HEADERS, timeout=10)
            if self.ocr is None:
                return False, "系统未安装或无法初始化 ddddocr OCR 识别引擎"

            raw_code = self.ocr.classification(captcha_resp.content)
            clean_code = re.sub(r"[^a-zA-Z0-9]", "", raw_code)
            input_code = clean_code[-4:] if len(clean_code) >= 4 else clean_code
        except Exception as e:
            return False, f"拉取或识别验证码异常: {e}"

        if not input_code:
            return False, "验证码识别为空，准备重试"

        # 2. 转换参数
        encoded_name = self.encode_course_name(f"{course.name}_{course.seq_no}")
        fajhh = self.config.major_id or ""

        post_data = {
            "dealType": deal_type,
            "kcIds": course.kc_id,
            "kcms": encoded_name,
            "fajhh": fajhh,
            "sj": "0_0",
            "kkxsh": "",
            "kclbdm": "",
            "kclbdm2": "",
            "inputCode": input_code,
            "tokenValue": token,
        }

        # 3. 提交选课请求
        try:
            submit_resp = session.post(COURSE_SUBMIT_URL, data=post_data, headers=HTTP_HEADERS, timeout=12)
            resp_text = submit_resp.text
        except Exception as e:
            return False, f"选课提交网络异常: {e}"

        # 4. 判定响应
        if "ok" in resp_text:
            # 等待 1 秒后发起二次校验，避免教务处异步队列未完成写入
            time.sleep(1.0)
            verified = self.verify_enrollment(session, course)
            if verified:
                return True, "抢课成功！教务处已确认选修状态"
            restr = course.restriction.strip()
            hint = f" (选课限制: {restr})" if restr and restr not in (";", "") else ""
            return False, f"提交队列已被接受，但未通过选修校验{hint}"

        if "错误" in resp_text:
            return False, f"教务处返回错误提示 (可能验证码未匹配: {input_code})"

        return False, f"提交返回: {resp_text[:80]}"

    # ================== 抢课任务与队列管理 ==================

    def get_task(self, kc_id: str) -> Optional[GrabTask]:
        with self._lock:
            for t in self.tasks:
                if t.kc_id == kc_id:
                    return t
        return None

    def add_task(self, course: CourseItem, group_id: int = 0) -> GrabTask:
        with self._lock:
            # 检查是否已存在
            for t in self.tasks:
                if t.kc_id == course.kc_id:
                    t.course = course
                    t.group_id = group_id
                    t.status = GrabStatus.WAITING
                    t.updated_at = time.time()
                    self.save_tasks()
                    self.add_log("INFO", f"已更新任务: {course.name} ({course.display_id}) 备选组={group_id}")
                    return t

            new_task = GrabTask(course=course, status=GrabStatus.WAITING, group_id=group_id)
            self.tasks.append(new_task)
            self.save_tasks()
            self.add_log("INFO", f"新增抢课目标: {course.name} ({course.display_id}) 备选组={group_id}")
            return new_task

    def remove_task(self, kc_id: str) -> bool:
        with self._lock:
            orig_len = len(self.tasks)
            self.tasks = [t for t in self.tasks if t.kc_id != kc_id]
            if len(self.tasks) != orig_len:
                self.save_tasks()
                self.add_log("INFO", f"已从队列移除课程任务: {kc_id}")
                return True
        return False

    def clear_tasks(self, only_finished: bool = False):
        with self._lock:
            if only_finished:
                self.tasks = [t for t in self.tasks if t.status not in (GrabStatus.SUCCESS, GrabStatus.FAILED, GrabStatus.CANCELLED)]
                self.add_log("INFO", "已清除所有已完成与终态的抢课任务")
            else:
                self.tasks = []
                self.add_log("INFO", "已清空全部抢课任务队列")
            self.save_tasks()

    def reorder_tasks(self, ordered_kc_ids: List[str]):
        """调整任务优先级，保持前端排序"""
        with self._lock:
            task_map = {t.kc_id: t for t in self.tasks}
            new_list = []
            for kid in ordered_kc_ids:
                if kid in task_map:
                    new_list.append(task_map.pop(kid))
            for remaining in task_map.values():
                new_list.append(remaining)
            self.tasks = new_list
            self.save_tasks()

    def _cancel_group_peers(self, succeeded_task: GrabTask):
        """互斥备选组联动: 同组任意一门成功抢到，同组其余任务立即自动取消"""
        gid = succeeded_task.group_id
        if not gid or gid <= 0:
            return
        with self._lock:
            for t in self.tasks:
                if t is not succeeded_task and t.group_id == gid:
                    if t.status in (GrabStatus.WAITING, GrabStatus.GRABBING):
                        t.status = GrabStatus.CANCELLED
                        t.last_message = f"同备选组({gid})课程《{succeeded_task.course.name}》已抢到，本任务自动取消"
                        t.updated_at = time.time()
                        self.add_log("INFO", f"备选组 {gid} 联动: 《{t.course.name}》已自动取消")

    # ================== 后台抢课线程生命周期 ==================

    def get_sleep_interval(self) -> float:
        base = max(0.2, self.config.sleep_time)
        jitter = abs(self.config.sleep_jitter)
        delay = base + random.uniform(-jitter, jitter)
        return max(0.1, delay)

    def start_engine(self, urp_client) -> Tuple[bool, str]:
        """启动后台抢课守护线程"""
        with self._lock:
            if self.is_running:
                return False, "抢课引擎已在运行中"

            if not urp_client.is_logged_in:
                return False, "教务系统尚未登录，请先登录账号"

            pending_tasks = [t for t in self.tasks if t.status in (GrabStatus.WAITING, GrabStatus.FAILED)]
            if not pending_tasks:
                return False, "队列中没有等待中的抢课任务，请先添加课程"

            # 将等待中的任务状态置为 GRABBING
            for t in pending_tasks:
                t.status = GrabStatus.GRABBING
                t.updated_at = time.time()
            self.save_tasks()

            self._stop_event.clear()
            self.is_running = True
            self.start_time = time.time()
            self.total_attempts = 0
            self.success_count = 0

            self.add_log("INFO", f"抢课引擎已启动！待抢任务数: {len(pending_tasks)}，轮询间隔: {self.config.sleep_time}s (±{self.config.sleep_jitter}s)")

            self._worker_thread = threading.Thread(
                target=self._run_grab_loop,
                args=(urp_client,),
                daemon=True,
                name="GrabEngineWorker",
            )
            self._worker_thread.start()
            return True, "抢课引擎启动成功"

    def stop_engine(self) -> Tuple[bool, str]:
        """停止后台抢课引擎"""
        with self._lock:
            if not self.is_running:
                return False, "抢课引擎当前未在运行"

            self._stop_event.set()
            self.is_running = False
            for t in self.tasks:
                if t.status == GrabStatus.GRABBING:
                    t.status = GrabStatus.WAITING
                    t.updated_at = time.time()
            self.save_tasks()
            self.add_log("WARNING", "抢课引擎已收到停止指令，正在安全退出...")
            return True, "抢课引擎已停止"

    def _run_grab_loop(self, urp_client):
        """核心抢课多目标轮询线程函数，深度融合毫秒级定时待命与开抢前 30s 自动预热机制"""
        session = urp_client.session
        consecutive_failures: Dict[str, int] = {}

        self.add_log("DEBUG", "后台抢课守护线程已就绪，正在预备动态 Token 与验证码模块...")

        # === 毫秒级定时开抢分支 ===
        if self.scheduled_epoch and self.scheduled_epoch > time.time():
            self.is_scheduled_waiting = True
            preheated = False
            target_dt_str = datetime.datetime.fromtimestamp(self.scheduled_epoch).strftime("%Y-%m-%d %H:%M:%S")
            self.add_log("INFO", f"🎯 抢课引擎进入定时待命状态，目标开抢时间: {target_dt_str}")

            last_broadcast_remain = 999999
            while not self._stop_event.is_set():
                now = time.time()
                remaining = self.scheduled_epoch - now
                if remaining <= 0:
                    break

                # (1) 周期性倒计时广播
                if remaining > 60 and (last_broadcast_remain - remaining >= 60):
                    last_broadcast_remain = remaining
                    self.add_log("INFO", f"⏳ 定时开抢待命中: 距离开抢还有 {int(remaining // 60)} 分 {int(remaining % 60)} 秒...")
                elif remaining <= 60 and remaining > 30 and (last_broadcast_remain - remaining >= 10):
                    last_broadcast_remain = remaining
                    self.add_log("INFO", f"⏳ 距离开抢仅剩 {int(remaining)} 秒，准备深度预热...")

                # (2) 开抢前 30 秒深度自动预热 (Session 活性 + Token 预取 + OCR 模型预热)
                if remaining <= 30.0 and not preheated:
                    preheated = True
                    self.add_log("INFO", "⚡ 开抢倒计时进入 30 秒！启动深度预热：检测会话活性与预取选课 Token...")
                    try:
                        # 会话保活检测
                        if not urp_client.verify_session_alive():
                            self.add_log("WARNING", "预热检测: 会话已失效，立即触发透明静默重新登录...")
                            urp_client.keep_alive()
                        # 预取一次 Token
                        _pre_token = self.extract_token_from_page(session)
                        # 预热一次 OCR 识别引擎，确保模型已驻留内存
                        if self.ocr is not None:
                            try:
                                _dummy = session.get(YZM_PIC_URL, headers=HTTP_HEADERS, timeout=5).content
                                self.ocr.classification(_dummy)
                            except Exception:
                                pass
                        self.add_log("SUCCESS", f"✅ 深度预热完成！Token: {_pre_token[:10]}... 已锁定，就绪等待准星击发！")
                    except Exception as pre_err:
                        self.add_log("WARNING", f"预热过程产生异常: {pre_err}，开抢时将重新拉取")

                # (3) 步长自适应休眠
                if remaining > 3.0:
                    time.sleep(min(0.5, remaining - 3.0))
                elif remaining > 0.05:
                    time.sleep(0.01)
                else:
                    # 最后 50 毫秒高精度自旋循环，确保毫秒级准时到达
                    while time.time() < self.scheduled_epoch:
                        pass
                    break

            if self._stop_event.is_set():
                self.is_scheduled_waiting = False
                return

            self.is_scheduled_waiting = False
            self.add_log("SUCCESS", f"🚀【准星击发】到达指定开抢时间 ({datetime.datetime.now().strftime('%H:%M:%S.%f')[:-3]})！并发唤醒所有待抢任务！")

        while not self._stop_event.is_set():
            # 1. 过滤当前仍在进行中的任务
            with self._lock:
                active_tasks = [t for t in self.tasks if t.status == GrabStatus.GRABBING]

            if not active_tasks:
                self.add_log("SUCCESS", "队列中所有任务均已执行完成或已取消，抢课引擎自动结束")
                break

            # 2. 检查会话并获取页面动态 Token
            try:
                token = self.extract_token_from_page(session)
            except Exception as e:
                self.add_log("ERROR", f"拉取选课动态 Token 异常: {e}，尝试检测会话存活...")
                if not urp_client.verify_session_alive():
                    self.add_log("WARNING", "教务处会话已失效，正在尝试静默重新登录保活...")
                    ok = urp_client.keep_alive()
                    if not ok:
                        self.add_log("ERROR", "自动重登失败，抢课引擎暂停，请在面板重新登录")
                        break
                time.sleep(self.get_sleep_interval())
                continue

            # 3. 逐一检查并尝试抢课
            for task in active_tasks:
                if self._stop_event.is_set():
                    break

                course = task.course
                task.attempts += 1
                self.total_attempts += 1
                task.updated_at = time.time()

                self.add_log("DEBUG", f"[{task.attempts}] 正在检查余量: 《{course.name}》({course.display_id})...")

                # 4. 实时重新搜索查询余量
                try:
                    search_kw = course.course_id if course.course_id else course.name
                    fresh_list = self.search_courses(
                        session,
                        keyword=search_kw,
                        phase=self.config.phase,
                        major_id=self.config.major_id,
                    )
                except Exception as e:
                    self.add_log("WARNING", f"检索课程《{course.name}》失败: {e}")
                    time.sleep(self.get_sleep_interval())
                    continue

                matched: Optional[CourseItem] = None
                for c in fresh_list:
                    if c.course_id == course.course_id and c.seq_no == course.seq_no:
                        matched = c
                        break

                if matched is None:
                    # 尝试按名称兜底匹配一次
                    for c in fresh_list:
                        if c.name == course.name and c.seq_no == course.seq_no:
                            matched = c
                            break

                if matched is None:
                    task.last_message = "当前选课批次列表中未检索到该课程"
                    self.add_log("WARNING", f"《{course.name}》({course.display_id}) 在当前阶段未找到，稍后重试")
                    time.sleep(self.get_sleep_interval())
                    continue

                # 更新最新余量与信息
                task.course.seats_free = matched.seats_free
                task.course.classroom = matched.classroom or task.course.classroom

                # 5. 余量判断
                if matched.seats_free <= 0:
                    task.last_message = f"课余量为 0，继续等待名额释放"
                    # 余量不足时直接休眠，不浪费验证码
                    time.sleep(self.get_sleep_interval())
                    continue

                # 6. 发现空位！立即执行抢课提交！
                self.add_log("INFO", f"⚡ 发现余量 ({matched.seats_free}个)! 立即为《{course.name}》({course.display_id}) 提交选课...")
                ok, msg = self.attempt_single_grab(
                    session=session,
                    course=matched,
                    token=token,
                    phase=self.config.phase,
                )
                task.last_message = msg
                task.updated_at = time.time()

                if ok:
                    task.status = GrabStatus.SUCCESS
                    self.success_count += 1
                    self.add_log("SUCCESS", f"🎉 恭喜！《{course.name}》({course.display_id}) 选课成功！{msg}")
                    self._cancel_group_peers(task)
                    self.save_tasks()
                else:
                    self.add_log("ERROR", f"提交《{course.name}》未成功: {msg}")
                    curr_fail = consecutive_failures.get(course.kc_id, 0) + 1
                    consecutive_failures[course.kc_id] = curr_fail
                    if curr_fail >= self.config.max_failures:
                        task.status = GrabStatus.FAILED
                        task.last_message = f"连续失败 {curr_fail} 次，已触发安全熔断停止"
                        self.add_log("ERROR", f"⚠️ 《{course.name}》连续失败达到 {self.config.max_failures} 次上限，自动熔断停止")
                        self.save_tasks()

                time.sleep(self.get_sleep_interval())

        # 退出循环处理
        with self._lock:
            self.is_running = False
            self.is_scheduled_waiting = False
            for t in self.tasks:
                if t.status == GrabStatus.GRABBING:
                    t.status = GrabStatus.WAITING
            self.save_tasks()

        self.add_log("INFO", "抢课引擎后台循环已安全结束")

    def get_status_overview(self) -> Dict[str, Any]:
        """获取当前抢课运行状态汇总数据"""
        with self._lock:
            elapsed_sec = int(time.time() - self.start_time) if (self.is_running and self.start_time) else 0
            waiting = sum(1 for t in self.tasks if t.status == GrabStatus.WAITING)
            grabbing = sum(1 for t in self.tasks if t.status == GrabStatus.GRABBING)
            success = sum(1 for t in self.tasks if t.status == GrabStatus.SUCCESS)
            failed = sum(1 for t in self.tasks if t.status == GrabStatus.FAILED)
            cancelled = sum(1 for t in self.tasks if t.status == GrabStatus.CANCELLED)

            has_scheduled = bool(self.scheduled_epoch and self.scheduled_epoch > 0)
            remaining_sec = max(0.0, self.scheduled_epoch - time.time()) if has_scheduled else 0.0

            return {
                "isRunning": self.is_running,
                "elapsedSeconds": elapsed_sec,
                "elapsedFormatted": str(datetime.timedelta(seconds=elapsed_sec)),
                "totalAttempts": self.total_attempts,
                "successCount": success,
                "failedCount": failed,
                "waitingCount": waiting,
                "grabbingCount": grabbing,
                "cancelledCount": cancelled,
                "totalTasks": len(self.tasks),
                "phase": self.config.phase,
                "phaseName": PHASE_META.get(self.config.phase, {}).get("name", "自由选课"),
                "majorId": self.config.major_id,
                "hasScheduled": has_scheduled,
                "scheduledTime": self.config.scheduled_time,
                "isScheduledWaiting": self.is_scheduled_waiting,
                "scheduledRemainingSeconds": round(remaining_sec, 2),
                "formattedCountdown": str(datetime.timedelta(seconds=int(remaining_sec))) if has_scheduled else "",
            }


# 全局单例管理器
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
grabber_manager = CourseGrabberManager(DATA_DIR)
