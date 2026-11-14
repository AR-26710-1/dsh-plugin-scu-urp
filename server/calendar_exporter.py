"""
四川大学课表 -> 标准 iCalendar (RFC 5545 .ics) 导出引擎
支持导入 iOS/macOS 日历、小米/华为/OPPO/vivo 日历、Google Calendar、Outlook 等
支持上课前 15 分钟弹窗通知、完整教室与授课教师标注
"""
import datetime
from typing import List, Dict, Any, Optional

# 四川大学官方本科教学作息时间表 (来源: 四川大学教务处 https://jwc.scu.edu.cn/scdxbkjxzxsj.htm)
# 1. 望江、华西校区
SCU_SESSION_TIMES_WANGJIANG_HUAXI = {
    1: ("08:00", "08:45"),
    2: ("08:55", "09:40"),
    3: ("10:00", "10:45"),
    4: ("10:55", "11:40"),
    5: ("14:00", "14:45"),
    6: ("14:55", "15:40"),
    7: ("15:50", "16:35"),
    8: ("16:55", "17:40"),
    9: ("17:50", "18:35"),
    10: ("19:30", "20:15"),
    11: ("20:25", "21:10"),
    12: ("21:20", "22:05"),
}

# 2. 江安校区
SCU_SESSION_TIMES_JIANGAN = {
    1: ("08:15", "09:00"),
    2: ("09:10", "09:55"),
    3: ("10:15", "11:00"),
    4: ("11:10", "11:55"),
    5: ("13:50", "14:35"),
    6: ("14:45", "15:30"),
    7: ("15:40", "16:25"),
    8: ("16:45", "17:30"),
    9: ("17:40", "18:25"),
    10: ("19:20", "20:05"),
    11: ("20:15", "21:00"),
    12: ("21:10", "21:55"),
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

            # 地点格式化与校区时刻表判定 (来源: 四川大学教务处 https://jwc.scu.edu.cn/scdxbkjxzxsj.htm)
            campus = s.get("campus", "") or ""
            building = s.get("building", "") or ""
            classroom = s.get("classroom", "") or ""
            loc_parts = [p for p in [campus, building, classroom] if p]
            location_str = " ".join(loc_parts) if loc_parts else "四川大学"

            is_wj_hx = ("望江" in campus) or ("华西" in campus) or ("望江" in building) or ("华西" in building)
            session_times_table = SCU_SESSION_TIMES_WANGJIANG_HUAXI if is_wj_hx else SCU_SESSION_TIMES_JIANGAN

            if not day or not start_sess or start_sess not in session_times_table:
                continue

            start_clock = session_times_table[start_sess][0]
            end_clock = session_times_table.get(end_sess, session_times_table[start_sess])[1]

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
