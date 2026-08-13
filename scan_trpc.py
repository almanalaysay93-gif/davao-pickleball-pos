import json, re, sys

path = "/home/ubuntu/davao-pickleball-pos/.manus-logs/networkRequests.log"
seen = {}
with open(path) as f:
    for line in f:
        line = line.strip()
        m = re.match(r"\[([^\]]+)\] (\{.*)", line)
        if not m:
            continue
        try:
            d = json.loads(m.group(2))
        except Exception:
            continue
        if "trpc" not in d.get("url", ""):
            continue
        resp = d.get("response") or {}
        status = resp.get("status")
        err = d.get("error")
        body = resp.get("body")
        # detect HTML body
        html = False
        if isinstance(body, str) and body.strip().lower().startswith("<"):
            html = True
        key = f"{status}/{html}"
        if key not in seen:
            seen[key] = {"url": d.get("url")[:120], "body_snip": str(body)[:200], "err": str(err)[:200], "ts": d.get("timestamp")}
for k, v in seen.items():
    print(k, v)
