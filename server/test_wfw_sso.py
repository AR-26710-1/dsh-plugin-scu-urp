from wfw_client import wfw_client

print("Testing wfw_client.get_card_status()...")
card_res = wfw_client.get_card_status(force_refresh=True)
print("Card result success:", card_res.get("success"))
print("Balance:", card_res.get("balance"), "TodaySpent:", card_res.get("todaySpent"), "Record count:", card_res.get("recordCount"))
if card_res.get("records"):
    print("First record:", card_res["records"][0])

print("\nTesting wfw_client.get_network_status()...")
net_res = wfw_client.get_network_status(force_refresh=True)
print("Network result success:", net_res.get("success"))
print("Device count:", net_res.get("deviceCount"))
print("Devices:", net_res.get("devices"))
