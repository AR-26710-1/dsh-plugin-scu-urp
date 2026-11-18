"""
四川大学宿舍电费历史记录与耗电趋势分析模块
负责：
1. 本地轻量化存储每次真实抄表快照 (server/data/electricity_history.json)
2. 防抖记录与真实用电走势计算
3. 生成 3 条真实用电折线数据：总电费/总电量变化、空调电量变化、照明电量变化
4. 真实数据原则：绝不虚构基线数据，数据不足时如实返回缺省标记
"""
import os
import json
import datetime
from typing import Dict, Any, List, Optional
try:
    from path_utils import get_data_dir
    DATA_DIR = get_data_dir()
except Exception:
    DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
HISTORY_FILE = os.path.join(DATA_DIR, "electricity_history.json")


def _ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)


def load_history_records() -> List[Dict[str, Any]]:
    """加载所有历史抄表记录 (100% 真实数据)"""
    _ensure_data_dir()
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # 过滤掉任何可能存在的历史虚构基线数据
            if isinstance(data, list):
                return [r for r in data if not r.get("isBaseline")]
            return []
    except Exception as e:
        print(f"[EleHistory] 读取历史记录失败: {e}")
        return []


def save_history_records(records: List[Dict[str, Any]]) -> bool:
    """持久化历史抄表记录 (保留最新 500 条真实记录)"""
    _ensure_data_dir()
    try:
        # 确保不写入 baseline 数据
        clean_records = [r for r in records if not r.get("isBaseline")][-500:]
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(clean_records, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[EleHistory] 写入历史记录失败: {e}")
        return False


def record_snapshot(room_display: str, air_balance: Optional[float], light_balance: Optional[float], price: float = 0.5464) -> Dict[str, Any]:
    """
    记录一次真实抄表快照
    防抖：若 15 分钟内且度数未发生变化，则不重复插入
    """
    records = load_history_records()
    now = datetime.datetime.now()
    now_ts = int(now.timestamp())
    now_date = now.strftime("%Y-%m-%d")
    now_time = now.strftime("%H:%M:%S")

    air_val = round(float(air_balance), 2) if air_balance is not None else None
    light_val = round(float(light_balance), 2) if light_balance is not None else None
    total_val = round((air_val or 0.0) + (light_val or 0.0), 2)

    # 防抖检查
    if records:
        last = records[-1]
        last_ts = last.get("timestamp", 0)
        # 15 分钟 (900秒) 内，且度数完全一致
        if (now_ts - last_ts < 900) and last.get("air") == air_val and last.get("light") == light_val:
            return {"recorded": False, "reason": "15分钟内度数未变，防抖忽略", "current": last}

    new_entry = {
        "id": f"ele_{now_ts}",
        "timestamp": now_ts,
        "date": now_date,
        "time": now_time,
        "datetime": f"{now_date} {now_time}",
        "room": room_display or "当前宿舍",
        "air": air_val,
        "light": light_val,
        "total": total_val,
        "price": price,
        "estimatedCost": round(total_val * price, 2)
    }

    records.append(new_entry)
    save_history_records(records)
    return {"recorded": True, "entry": new_entry}


def get_electricity_trend(days: int = 14) -> Dict[str, Any]:
    """
    获取近 N 天的真实电费历史记录与耗电趋势分析
    包含 3 条走势曲线：
      1. 总电量 (total)
      2. 空调回路 (air)
      3. 照明回路 (light)
    真实数据原则：绝不虚构数据，数据不足 2 条时标记 isInsufficient: True，折线图空置提示积累中
    """
    records = load_history_records()
    now = datetime.datetime.now()

    # 过滤出近 N 天的真实记录
    cutoff_ts = int((now - datetime.timedelta(days=days)).timestamp())
    period_records = [r for r in records if r.get("timestamp", 0) >= cutoff_ts]
    # 若近 N 天内无记录但整体有记录，则展示全部已有真实记录
    if not period_records and records:
        period_records = records

    # 按天归纳真实读数（取当天最后一次抄表快照）
    date_map: Dict[str, List[Dict[str, Any]]] = {}
    for r in period_records:
        d = r.get("date", "")
        if d:
            if d not in date_map:
                date_map[d] = []
            date_map[d].append(r)

    sorted_dates = sorted(date_map.keys())
    if len(sorted_dates) > days:
        sorted_dates = sorted_dates[-days:]

    timeline_points = []
    daily_usage = []
    prev_day_total = None

    for d_str in sorted_dates:
        day_records = date_map[d_str]
        # 当天最新一次抄表
        last_of_day = day_records[-1]
        cur_total = last_of_day.get("total", 0.0)
        cur_air = last_of_day.get("air", 0.0)
        cur_light = last_of_day.get("light", 0.0)
        unit_price = last_of_day.get("price", 0.5464)

        timeline_points.append({
            "date": d_str,
            "shortDate": d_str[5:],  # MM-DD
            "time": last_of_day.get("time", ""),
            "datetime": last_of_day.get("datetime", f"{d_str} {last_of_day.get('time', '')}"),
            "air": cur_air,
            "airCost": round(cur_air * unit_price, 2),
            "light": cur_light,
            "lightCost": round(cur_light * unit_price, 2),
            "total": cur_total,
            "cost": last_of_day.get("estimatedCost", round(cur_total * unit_price, 2))
        })

        # 计算日耗电（有前一天读数时计算读数下降量）
        if prev_day_total is not None:
            diff = round(prev_day_total - cur_total, 2)
            used = max(0.0, diff) if diff >= 0 else 0.0  # 若充值导致读数变大，消耗记 0
            daily_usage.append({
                "date": d_str,
                "shortDate": d_str[5:],
                "usedDegrees": round(used, 2),
                "cost": round(used * unit_price, 2)
            })
        prev_day_total = cur_total

    # 如果不同日期少于 2 天，但是真实抄表记录 >= 2 条，也可以按时间点提供 timeline 供折线展示
    if len(timeline_points) < 2 and len(period_records) >= 2:
        timeline_points = []
        for r in period_records:
            cur_tot = r.get("total", 0.0)
            cur_a = r.get("air", 0.0)
            cur_l = r.get("light", 0.0)
            u_p = r.get("price", 0.5464)
            timeline_points.append({
                "date": r.get("date", ""),
                "shortDate": r.get("date", "")[5:] if len(r.get("date", "")) >= 5 else "",
                "time": r.get("time", ""),
                "datetime": r.get("datetime", f"{r.get('date', '')} {r.get('time', '')}"),
                "air": cur_a,
                "airCost": round(cur_a * u_p, 2),
                "light": cur_l,
                "lightCost": round(cur_l * u_p, 2),
                "total": cur_tot,
                "cost": r.get("estimatedCost", round(cur_tot * u_p, 2))
            })

    is_insufficient = len(timeline_points) < 2

    # 统计数据
    latest_rec = records[-1] if records else None
    latest_total = latest_rec.get("total", 0.0) if latest_rec else 0.0
    latest_air = latest_rec.get("air", 0.0) if latest_rec else 0.0
    latest_light = latest_rec.get("light", 0.0) if latest_rec else 0.0

    if daily_usage:
        total_used_period = sum(u["usedDegrees"] for u in daily_usage)
        avg_daily_usage = round(total_used_period / len(daily_usage), 2)
        max_usage_day = max(daily_usage, key=lambda x: x["usedDegrees"])
        days_left = round(latest_total / max(0.5, avg_daily_usage), 1) if avg_daily_usage > 0 else 99
    else:
        total_used_period = 0.0
        avg_daily_usage = 0.0
        max_usage_day = None
        days_left = None

    return {
        "success": True,
        "days": days,
        "isInsufficient": is_insufficient,
        "totalRecordsCount": len(records),
        "timeline": timeline_points,
        "dailyUsage": daily_usage,
        "summary": {
            "currentTotalDegrees": latest_total,
            "currentAirDegrees": latest_air,
            "currentLightDegrees": latest_light,
            "avgDailyUsage": avg_daily_usage,
            "totalPeriodUsage": round(total_used_period, 2),
            "estimatedDaysLeft": days_left,
            "peakDay": max_usage_day,
            "unitPrice": 0.5464
        },
        "records": records[-50:],  # 最近 50 次真实抄表明细
        "lastUpdated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
