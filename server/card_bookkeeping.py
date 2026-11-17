"""
四川大学校园一卡通记账统计与每日消费汇总模块
负责：
1. 纯粹按天统计每日花费 (每天花了多少钱、消费笔数、每日流水详情)
2. 周期消费大盘核算 (今日支出 / 本周支出 / 本月支出 / 累计支出 / 日均消费)
3. 近 14 天每日花费走势 (用于直观每日开销柱状图)
4. 本地单笔交易自定义记账备注持久化 (server/data/card_notes.json)
"""
import os
import json
import datetime
from typing import Dict, Any, List, Optional

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
NOTES_FILE = os.path.join(DATA_DIR, "card_notes.json")


def _ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)


def load_card_notes() -> Dict[str, Any]:
    """加载所有自定义交易备注与记账标签"""
    _ensure_data_dir()
    if not os.path.exists(NOTES_FILE):
        return {}
    try:
        with open(NOTES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f"[CardBookkeeping] 读取记账备注失败: {e}")
        return {}


def save_card_note(record_id: str, note: str, tag: str = "") -> bool:
    """保存或更新单笔交易自定义备注"""
    _ensure_data_dir()
    notes = load_card_notes()
    clean_note = note.strip()
    clean_tag = tag.strip()

    if not clean_note and not clean_tag:
        # 清除备注
        notes.pop(record_id, None)
    else:
        notes[record_id] = {
            "note": clean_note,
            "tag": clean_tag,
            "updatedAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

    try:
        with open(NOTES_FILE, "w", encoding="utf-8") as f:
            json.dump(notes, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[CardBookkeeping] 保存记账备注失败: {e}")
        return False


def analyze_card_records(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    对一卡通交易流水进行每日消费统计与核算 (无需消费场景分类)
    """
    notes = load_card_notes()
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")

    # 本周起始日期 (周一)
    start_of_week = (now - datetime.timedelta(days=now.weekday())).strftime("%Y-%m-%d")
    # 本月起始日期 (当月 1 日)
    start_of_month = now.strftime("%Y-%m-01")

    today_spent = 0.0
    week_spent = 0.0
    month_spent = 0.0
    total_expense = 0.0
    total_recharge = 0.0

    # 按天汇总消费流水字典
    # date_str -> { date, shortDate, weekday, totalSpent, count, records }
    day_groups: Dict[str, Dict[str, Any]] = {}

    enhanced_records = []
    max_expense_record = None

    for item in records:
        r_id = item.get("id", "")
        r_date = item.get("date", "")
        amount = float(item.get("amount", 0.0))
        t_type = item.get("type", "消费")
        merchant = item.get("merchant", "")
        raw_to = item.get("rawToname", "")
        text = f"{merchant} {raw_to} {t_type}".lower()

        # 判断是否为充值补助类流水
        is_recharge = any(k in text for k in ["充值", "补助", "圈存", "退款"]) or "充值" in t_type

        # 挂载用户自定义备注
        user_note = notes.get(r_id, {})
        enhanced_item = {
            **item,
            "isRecharge": is_recharge,
            "userNote": user_note.get("note", ""),
            "userTag": user_note.get("tag", "")
        }
        enhanced_records.append(enhanced_item)

        if is_recharge:
            total_recharge += amount
        else:
            total_expense += amount

            if r_date == today_str:
                today_spent += amount
            if r_date >= start_of_week:
                week_spent += amount
            if r_date >= start_of_month:
                month_spent += amount

            # 单笔最大消费跟踪
            if (max_expense_record is None or amount > max_expense_record["amount"]) and amount > 0:
                max_expense_record = {
                    "amount": round(amount, 2),
                    "merchant": merchant,
                    "date": r_date,
                    "datetime": enhanced_item.get("datetime", "")
                }

        # 归入当天的分组（只统计支出，充值单独记录）
        if r_date:
            if r_date not in day_groups:
                try:
                    d_obj = datetime.datetime.strptime(r_date, "%Y-%m-%d")
                    w_str = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][d_obj.weekday()]
                    s_date = r_date[5:]
                except Exception:
                    w_str = ""
                    s_date = r_date

                day_groups[r_date] = {
                    "date": r_date,
                    "shortDate": s_date,
                    "weekday": w_str,
                    "totalSpent": 0.0,
                    "rechargeAmt": 0.0,
                    "count": 0,
                    "records": []
                }

            day_groups[r_date]["records"].append(enhanced_item)
            if is_recharge:
                day_groups[r_date]["rechargeAmt"] = round(day_groups[r_date]["rechargeAmt"] + amount, 2)
            else:
                day_groups[r_date]["totalSpent"] = round(day_groups[r_date]["totalSpent"] + amount, 2)
                day_groups[r_date]["count"] += 1

    # 倒序排列每天的消费明细清单
    daily_expense_list = sorted(day_groups.values(), key=lambda x: x["date"], reverse=True)

    # 构造近 14 天连续走势槽位 (无论有无消费均保证槽位完整，便于前端柱状图展示)
    daily_trend = []
    for i in range(13, -1, -1):
        target_d = (now - datetime.timedelta(days=i))
        t_str = target_d.strftime("%Y-%m-%d")
        existing = day_groups.get(t_str)
        daily_trend.append({
            "date": t_str,
            "shortDate": t_str[5:],
            "weekday": ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][target_d.weekday()],
            "amount": existing["totalSpent"] if existing else 0.0,
            "count": existing["count"] if existing else 0
        })

    # 计算有实际支出的天数与日均消费
    spending_days = [d for d in daily_expense_list if d["totalSpent"] > 0]
    active_days_count = max(1, len(spending_days))
    avg_daily_spent = round(total_expense / active_days_count, 2)

    # 花费最高的一天
    max_day = max(spending_days, key=lambda x: x["totalSpent"]) if spending_days else None

    return {
        "success": True,
        "summary": {
            "todaySpent": round(today_spent, 2),
            "weekSpent": round(week_spent, 2),
            "monthSpent": round(month_spent, 2),
            "totalExpense": round(total_expense, 2),
            "totalRecharge": round(total_recharge, 2),
            "avgDailySpent": avg_daily_spent,
            "activeDaysCount": len(spending_days),
            "totalRecords": len(records),
            "maxExpense": max_expense_record,
            "maxDay": {
                "date": max_day["date"],
                "amount": max_day["totalSpent"],
                "count": max_day["count"]
            } if max_day else None
        },
        "dailyTrend": daily_trend,            # 近 14 天每日花费走势 (绘图用)
        "dailyExpenseList": daily_expense_list, # 按天归类的账单明细列表
        "records": enhanced_records,          # 扁平化全部流水
        "lastUpdated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
