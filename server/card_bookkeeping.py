"""
四川大学校园一卡通记账统计与智能消费分析模块
负责：
1. 流水智能分类识别 (餐饮食堂 / 超市便利 / 生活服务 / 宽带缴费 / 充值补助 / 其他)
2. 周期消费大盘核算 (今日 / 本周 / 本月 / 日均消费 / 消费最高单笔)
3. 近 14 天 / 近 30 天每日花费趋势与笔数统计 (用于折线柱状图)
4. 本地流水自定义备注与标签持久化 (server/data/card_notes.json)
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


def classify_merchant(merchant_name: str, raw_toname: str = "", trade_type: str = "") -> Dict[str, str]:
    """
    智能商户与交易类型分类引擎
    返回: { "category": key, "categoryName": 友好中文, "icon": 图标标识, "color": 颜色值 }
    """
    text = f"{merchant_name} {raw_toname} {trade_type}".lower()

    if "充值" in text or "补助" in text or "圈存" in text or "退款" in text:
        return {"category": "recharge", "categoryName": "充值补助", "icon": "download", "color": "#10b981"}

    # 1. 食堂与餐饮
    dining_keywords = [
        "食堂", "餐厅", "饮食", "快餐", "自选", "小吃", "面点", "面馆", "早点", "点心",
        "瓦罐", "清真", "烤肉", "冒菜", "黄焖鸡", "水饺", "米线", "粉丝", "汉堡", "教工",
        "东园", "西园", "一食堂", "二食堂", "三食堂", "档口", "美食", "饭", "菜"
    ]
    if any(k in text for k in dining_keywords):
        return {"category": "dining", "categoryName": "食堂餐饮", "icon": "coffee", "color": "#f59e0b"}

    # 2. 超市与日用品
    supermarket_keywords = ["超市", "便利", "红旗", "百货", "商贸", "购物", "水果", "文具", "副食"]
    if any(k in text for k in supermarket_keywords):
        return {"category": "supermarket", "categoryName": "超市便利", "icon": "shopping-cart", "color": "#3b82f6"}

    # 3. 公共生活与洗浴开水
    life_keywords = ["开水", "浴室", "洗浴", "水房", "开水房", "洗衣", "吹风机", "理发", "直饮水", "饮水"]
    if any(k in text for k in life_keywords):
        return {"category": "life", "categoryName": "生活水房", "icon": "droplet", "color": "#06b6d4"}

    # 4. 网络与公共缴费
    bill_keywords = ["网费", "电费", "卡费", "工本费", "上机", "机房", "打印", "复印"]
    if any(k in text for k in bill_keywords):
        return {"category": "bill", "categoryName": "网络缴费", "icon": "wifi", "color": "#8b5cf6"}

    # 兜底：其他消费
    return {"category": "other", "categoryName": "其他消费", "icon": "tag", "color": "#71717a"}


def analyze_card_records(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    对一卡通交易流水进行全维度记账统计与分析
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

    # 分类聚合统计
    category_totals: Dict[str, Dict[str, Any]] = {
        "dining": {"name": "食堂餐饮", "amount": 0.0, "count": 0, "color": "#f59e0b", "icon": "coffee"},
        "supermarket": {"name": "超市便利", "amount": 0.0, "count": 0, "color": "#3b82f6", "icon": "shopping-cart"},
        "life": {"name": "生活水房", "amount": 0.0, "count": 0, "color": "#06b6d4", "icon": "droplet"},
        "bill": {"name": "网络缴费", "amount": 0.0, "count": 0, "color": "#8b5cf6", "icon": "wifi"},
        "other": {"name": "其他消费", "amount": 0.0, "count": 0, "color": "#71717a", "icon": "tag"},
        "recharge": {"name": "充值补助", "amount": 0.0, "count": 0, "color": "#10b981", "icon": "download"}
    }

    # 按天归集近 14 天日常消费 (用于趋势折线/柱状图)
    daily_expense_map: Dict[str, Dict[str, Any]] = {}
    
    # 预填充最近 14 天的槽位
    for i in range(13, -1, -1):
        d_str = (now - datetime.timedelta(days=i)).strftime("%Y-%m-%d")
        daily_expense_map[d_str] = {
            "date": d_str,
            "shortDate": d_str[5:],  # MM-DD
            "weekday": ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][(now - datetime.timedelta(days=i)).weekday()],
            "amount": 0.0,
            "count": 0
        }

    enhanced_records = []
    max_expense_record = None

    for item in records:
        r_id = item.get("id", "")
        r_date = item.get("date", "")
        amount = float(item.get("amount", 0.0))
        t_type = item.get("type", "消费")
        merchant = item.get("merchant", "")
        raw_to = item.get("rawToname", "")

        # 智能分类
        cat_info = classify_merchant(merchant, raw_to, t_type)
        cat_key = cat_info["category"]

        # 获取用户自定义记账备注
        user_note = notes.get(r_id, {})
        enhanced_item = {
            **item,
            "category": cat_key,
            "categoryName": cat_info["categoryName"],
            "categoryColor": cat_info["color"],
            "categoryIcon": cat_info["icon"],
            "userNote": user_note.get("note", ""),
            "userTag": user_note.get("tag", "")
        }
        enhanced_records.append(enhanced_item)

        # 支出或充值归集
        if cat_key == "recharge":
            total_recharge += amount
            category_totals["recharge"]["amount"] += amount
            category_totals["recharge"]["count"] += 1
        else:
            # 属于支出
            total_expense += amount
            category_totals[cat_key]["amount"] += amount
            category_totals[cat_key]["count"] += 1

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

            # 填充到每日走势中 (如果在近 14 天内)
            if r_date in daily_expense_map:
                daily_expense_map[r_date]["amount"] = round(daily_expense_map[r_date]["amount"] + amount, 2)
                daily_expense_map[r_date]["count"] += 1

    # 格式化各分类金额与占比
    categories_summary = []
    for k, v in category_totals.items():
        if k == "recharge":
            continue
        amt = round(v["amount"], 2)
        pct = round((amt / total_expense * 100), 1) if total_expense > 0 else 0.0
        categories_summary.append({
            "category": k,
            "name": v["name"],
            "amount": amt,
            "percentage": pct,
            "count": v["count"],
            "color": v["color"],
            "icon": v["icon"]
        })

    # 按消费金额由高到低排序
    categories_summary.sort(key=lambda x: x["amount"], reverse=True)

    # 每日趋势列表 (按时间正序排列)
    daily_trend = sorted(daily_expense_map.values(), key=lambda x: x["date"])

    # 计算有记录以来的实际天数与日均消费
    unique_dates = set(r["date"] for r in records if r.get("date"))
    active_days = max(1, len(unique_dates))
    avg_daily_spent = round(total_expense / active_days, 2)

    return {
        "success": True,
        "summary": {
            "todaySpent": round(today_spent, 2),
            "weekSpent": round(week_spent, 2),
            "monthSpent": round(month_spent, 2),
            "totalExpense": round(total_expense, 2),
            "totalRecharge": round(total_recharge, 2),
            "avgDailySpent": avg_daily_spent,
            "activeDaysCount": active_days,
            "totalRecords": len(records),
            "maxExpense": max_expense_record,
            "diningShare": next((c["percentage"] for c in categories_summary if c["category"] == "dining"), 0.0)
        },
        "categories": categories_summary,
        "dailyTrend": daily_trend,
        "records": enhanced_records,
        "lastUpdated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
