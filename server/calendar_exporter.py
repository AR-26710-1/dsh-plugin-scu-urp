"""
四川大学课表 -> 标准 iCalendar (RFC 5545 .ics) 导出引擎
支持导入 iOS/macOS 日历、小米/华为/OPPO/vivo 日历、Google Calendar、Outlook 等
支持上课前 15 分钟弹窗通知、完整教室与授课教师标注
"""
import datetime
from typing import List, Dict, Any, Optional

# 四川大学作息时刻表 (标准 12 节次)
SCU_SESSION_TIMES = {
    1: ("08:15", "09:00"),
    2: ("09:05", "09:50"),
    3: ("10:10", "10:55"),
    4: ("11:00", "11:45"),
    5: ("13:50", "14:35"),
    6: ("14:40", "15:25"),
    7: ("15:45", "16:30"),
    8: ("16:35", "17:20"),
    9: ("18:30", "19:15"),
    10: ("19:20", "20:05"),
    11: ("20:15", "21:00"),
    12: ("21:05", "21:50"),
}


def _escape_ics_text(text: str) -> str:
    """转义 iCalendar 规范保留字符"""
    if not text:
        return ""
    text = text.replace("\\", "\\\\")
    text = text.replace(";", "\\;")
    text = text.replace(",", "\\,")
    text = text.replace("\r\n", "\\n").replace("\n", "\\n")
    return text


def generate_ics(
    schedule_data: Dict[str, Any],
    start_monday_str: str = "2026-08-31",
    alarm_minutes: int = 15,
    calendar_name: str = "四川大学课程表",
) -> str:
    """
    根据教务处课表与学期起始周一日期生成标准 .ics 文件字符串
    :param schedule_data: get_schedule() 返回的字典
    :param start_monday_str: 第一教学周周一的公历日期 (格式 YYYY-MM-DD)
    :param alarm_minutes: 课前提前提醒分钟数，默认 15 分钟 (传 0 则不添加闹钟)
    :param calendar_name: 日历名称
    """
    start_monday = datetime.datetime.strptime(start_monday_str, "%Y-%m-%d").date()
    now_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SCU URP Harness Plugin//Timetable//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape_ics_text(calendar_name)}",
        "X-WR-TIMEZONE:Asia/Shanghai",
        "BEGIN:VTIMEZONE",
        "TZID:Asia/Shanghai",
        "X-LIC-LOCATION:Asia/Shanghai",
        "BEGIN:STANDARD",
        "TZOFFSETFROM:+0800",
        "TZOFFSETTO:+0800",
        "TZNAME:CST",
        "DTSTART:19700101T000000",
        "END:STANDARD",
        "END:VTIMEZONE",
    ]

    courses = schedule_data.get("courses", [])
    semester_id = schedule_data.get("semesterId", "sem")
    event_count = 0

    for c in courses:
        name = c.get("name", "未命名课程")
        teacher = c.get("teacher", "")
        prop = c.get("property", "")
        credit = c.get("credit", 0.0)
        c_code = f"{c.get('courseNumber', '')}-{c.get('unitNumber', '')}".strip("-")

        for s in (c.get("schedules") or []):
            day = s.get("day")  # 1-7
            start_sess = s.get("startSession")  # 1-12
            cont_sess = s.get("continuingSessions", 2) or 2
            end_sess = min(12, start_sess + cont_sess - 1)

            if not day or not start_sess or start_sess not in SCU_SESSION_TIMES:
                continue

            start_clock = SCU_SESSION_TIMES[start_sess][0]
            end_clock = SCU_SESSION_TIMES.get(end_sess, SCU_SESSION_TIMES[start_sess])[1]

            # 地点格式化
            campus = s.get("campus", "")
            building = s.get("building", "")
            classroom = s.get("classroom", "")
            loc_parts = [p for p in [campus, building, classroom] if p]
            location_str = " ".join(loc_parts) if loc_parts else "四川大学"

            weeks = s.get("weeks") or []
            week_desc = s.get("weekDescription") or (f"{weeks[0]}~{weeks[-1]}周" if weeks else "全周")

            for w in weeks:
                # 计算该周上课当天的具体日期
                days_delta = (w - 1) * 7 + (day - 1)
                event_date = start_monday + datetime.timedelta(days=days_delta)

                dtstart = f"{event_date.strftime('%Y%m%d')}T{start_clock.replace(':', '')}00"
                dtend = f"{event_date.strftime('%Y%m%d')}T{end_clock.replace(':', '')}00"
                uid = f"scu-{semester_id}-{c_code}-w{w}-d{day}-s{start_sess}-{event_date.strftime('%Y%m%d')}@zhjw.scu.edu.cn"

                description = (
                    f"课程名称: {name}\\n"
                    f"授课教师: {teacher or '待公布'}\\n"
                    f"课程性质: {prop} · {credit}学分\\n"
                    f"节次安排: 第 {start_sess}~{end_sess} 节 ({start_clock}~{end_clock})\\n"
                    f"教学周次: 第 {w} 周 (全学期: {week_desc})"
                )

                lines.extend([
                    "BEGIN:VEVENT",
                    f"UID:{uid}",
                    f"DTSTAMP:{now_utc}",
                    f"DTSTART;TZID=Asia/Shanghai:{dtstart}",
                    f"DTEND;TZID=Asia/Shanghai:{dtend}",
                    f"SUMMARY:{_escape_ics_text(name)}",
                    f"LOCATION:{_escape_ics_text(location_str)}",
                    f"DESCRIPTION:{description}",
                    "STATUS:CONFIRMED",
                ])

                if alarm_minutes > 0:
                    lines.extend([
                        "BEGIN:VALARM",
                        f"TRIGGER:-PT{alarm_minutes}M",
                        "ACTION:DISPLAY",
                        f"DESCRIPTION:上课提醒: {_escape_ics_text(name)} 15分钟后开始 ({location_str})",
                        "END:VALARM",
                    ])

                lines.append("END:VEVENT")
                event_count += 1

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines), event_count
