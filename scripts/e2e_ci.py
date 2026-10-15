import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APPS = {"admin":8000,"agent":8001,"shop":8002,"user":8003}
TOKEN = "p" * 48
SHOP_TOKEN = "s" * 48
DISPATCH_TOKEN = "d" * 48
ADMIN_PASSWORD = "Vegz" + "TestPass" * 2 + "2026!"
DATA = tempfile.TemporaryDirectory(prefix="vegz-e2e-")
PROCS = []
LOGS = []

def call(method, url, body=None, token=None, expected=(200,)):
    raw = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type":"application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=raw, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r: status, data = r.status, r.read()
    except urllib.error.HTTPError as e: status, data = e.code, e.read()
    text = data.decode()
    assert status in expected, f"{method} {url}: {status} {text}"
    return json.loads(text) if text else {}

def url(app, path=""):
    return f"http://127.0.0.1:{APPS[app]}{path}"

def start(app, env):
    root = ROOT / ("vegz-" + app)
    full = os.environ.copy()
    full.update(env)
    log = open(Path(DATA.name) / (app + ".log"), "w")
    LOGS.append(log)
    proc = subprocess.Popen([str(ROOT / (".venv-" + app) / "bin/python"), "-m", "uvicorn",
      "backend.app.main:app", "--host", "127.0.0.1", "--port", str(APPS[app])],
      cwd=root, env=full, stdout=log, stderr=subprocess.STDOUT)
    PROCS.append(proc)

def run():
    shared = {"APP_ENV":"development","PARTNER_ADMIN_TOKEN":TOKEN}
    start("admin", {**shared,"DATABASE_URL":f"sqlite:///{DATA.name}/admin.db",
      "JWT_SECRET":"a"*48,"BOOTSTRAP_ADMIN_EMAIL":"admin@example.com",
      "BOOTSTRAP_ADMIN_PASSWORD":ADMIN_PASSWORD,"SHOP_SERVICE_URL":url("shop"),
      "AGENT_SERVICE_URL":url("agent")})
    start("agent", {**shared,"DATABASE_URL":f"sqlite:///{DATA.name}/agent.db",
      "JWT_SECRET":"b"*48,"AGENT_DEMO_CODE":"123456","ADMIN_SERVICE_URL":url("admin"),
      "DISPATCH_SHARED_SECRET":DISPATCH_TOKEN})
    start("shop", {**shared,"DATABASE_URL":f"sqlite:///{DATA.name}/shop.db",
      "JWT_SECRET":"c"*48,"SHOP_DEMO_CODE":"123456","ADMIN_SERVICE_URL":url("admin"),
      "SHOP_INTERNAL_TOKEN":SHOP_TOKEN})
    start("user", {**shared,"DATABASE_URL":f"sqlite:///{DATA.name}/user.db",
      "JWT_SECRET":"e"*48,"OTP_SECRET":"f"*48,"SHOP_SERVICE_URL":url("shop"),
      "SHOP_PUBLIC_URL":url("shop"),"SHOP_INTERNAL_TOKEN":SHOP_TOKEN,
      "AGENT_SERVICE_URL":url("agent"),"DISPATCH_SHARED_SECRET":DISPATCH_TOKEN})
    for app in APPS:
        deadline = time.time() + 45
        while time.time() < deadline:
            try: call("GET",url(app,"/api/health")); print("PASS health",app); break
            except Exception: time.sleep(.5)
        else: raise RuntimeError(f"{app} failed to start; check its CI log")
    admin = call("POST",url("admin","/api/auth/login"),{"email":"admin@example.com","password":ADMIN_PASSWORD})["access_token"]
    shop = call("POST",url("shop","/api/auth/demo-login"),{"phone":"9876543212","demo_code":"123456","shop_type":"vegetable","city":"Hubli"})
    agent = call("POST",url("agent","/api/auth/demo-login"),{"phone":"9876543215","code":"123456","full_name":"E2E Agent","city":"Hubli"})
    assert shop["shop"]["approval_status"] == "pending"
    assert not agent["agent"]["is_verified"]
    shops = call("GET",url("admin","/api/shops?status_filter=pending"),token=admin)
    agents = call("GET",url("admin","/api/agents?status_filter=pending"),token=admin)
    sid = next(x["id"] for x in shops if x["phone"] == "+919876543212")
    aid = next(x["id"] for x in agents if x["phone"] == "+919876543215")
    call("PATCH",url("admin",f"/api/shops/{sid}"),{"status":"approved"},admin)
    call("PATCH",url("admin",f"/api/agents/{aid}"),{"status":"approved"},admin)
    st = call("GET",url("shop","/api/shop"),token=shop["access_token"])
    at = call("GET",url("agent","/api/me"),token=agent["access_token"])
    assert st["approval_status"] == "approved" and at["is_verified"]
    call("PATCH",url("shop","/api/shop"),{"is_open":True,"accepts_orders":True},shop["access_token"])
    product = call("POST",url("shop","/api/products"),{"name":"Tomato","price":35,"stock_qty":20,"is_available":True},shop["access_token"],(201,))
    call("PATCH",url("agent","/api/me"),{"is_online":True},agent["access_token"])
    catalog = call("GET",url("user","/api/products?city=Hubli"))
    item = next(x for x in catalog if x["shop_id"] == st["id"] and x["name"] == "Tomato")
    otp = call("POST",url("user","/api/auth/request-otp"),{"phone":"+919876543299"})["demo_otp"]
    customer = call("POST",url("user","/api/auth/verify-otp"),{"phone":"+919876543299","otp":otp})
    addr = call("POST",url("user","/api/addresses"),{"recipient_name":"E2E Customer","phone":"+919876543299","line1":"12 Test Market Road","city":"Hubli","state":"Karnataka","postal_code":"580020","is_default":True},customer["access_token"],(201,))
    order = call("POST",url("user","/api/orders"),{"address_id":addr["id"],"payment_method":"cod","items":[{"product_id":item["id"],"quantity":1}]},customer["access_token"],(201,))
    assert len(order.get("shop_orders",[])) == 1
    assert any(x["public_code"] == order["tracking_code"] for x in call("GET",url("agent","/api/orders"),token=agent["access_token"]))
    assert any(x.get("order_reference") == order["tracking_code"] for x in call("GET",url("shop","/api/orders"),token=shop["access_token"]))
    print("PASS admin login, partner registration/approval, catalog, checkout, shop order, agent dispatch")
    print("ALL CROSS-SERVICE E2E CHECKS PASSED")

try:
    run()
finally:
    for p in PROCS:
        if p.poll() is None: p.terminate()
    for p in PROCS:
        try: p.wait(timeout=5)
        except subprocess.TimeoutExpired: p.kill()
    for f in LOGS: f.close()
    DATA.cleanup()
