const API = "";
let FREE_DELIVERY_MINIMUM = 499;
let STANDARD_DELIVERY_FEE = 25;
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const productIcons = {
  tomato: "🍅", potato: "🥔", "red-onion": "🧅", carrot: "🥕",
  spinach: "🥬", broccoli: "🥦", cabbage: "🥬", "green-capsicum": "🫑", cucumber: "🥒", cauliflower: "🥦", brinjal: "🍆", "lady-finger": "🥬", "green-peas": "🫛", beetroot: "🫜", radish: "🥕", pumpkin: "🎃", "bitter-gourd": "🥒", "bottle-gourd": "🥒", "green-beans": "🫛", "sweet-corn": "🌽", garlic: "🧄", ginger: "🫚", "green-chilli": "🌶️", coriander: "🌿", mint: "🌿", "spring-onion": "🧅", "red-bell-pepper": "🫑", lettuce: "🥬", "basmati-rice": "🍚", "toor-dal": "🫘", "moong-dal": "🫘", "chana-dal": "🫘", "wheat-flour": "🌾", besan: "🌾", "cooking-oil": "🫒", sugar: "🧂", salt: "🧂", "tea-powder": "🍵", coffee: "☕", "turmeric-powder": "🟡", "red-chilli-powder": "🌶️", "cumin-seeds": "🌿", "mustard-seeds": "🌿", poha: "🍚", oats: "🥣", peanuts: "🥜", jaggery: "🍯", pasta: "🍝"
};

let products = [];
let activeCategory = "all";
let activeDepartment = "vegetables";
let query = "";
let cart = readCart();
let token = localStorage.getItem("vegz_token") || "";
let currentUser = null;
let pendingPhone = "";
let demoOtp = "";
let postAuthAction = "checkout";
let savedAddresses = [];
let selectedAddressId = null;
let showAddressForm = true;
let activeOrder = null;
let toastTimer = null;

const $ = (selector, root) => (root || document).querySelector(selector);
const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

function readCart() {
  try { return JSON.parse(localStorage.getItem("vegz_cart") || "{}"); }
  catch (_) { return {}; }
}
function saveCart() {
  localStorage.setItem("vegz_cart", JSON.stringify(cart));
}
function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
function currency(value) { return money.format(Number(value || 0)); }
function iconFor(product) { return productIcons[product.slug] || "🥦"; }
function departmentFor(product) {
  const category = String(product.category || "").trim().toLowerCase();
  return category === "grocery" || category === "spices" ? "grocery" : "vegetables";
}
function departmentLabel(department) { return department === "grocery" ? "Grocery" : "Vegetables"; }
function itemCount() { return Object.values(cart).reduce((sum, qty) => sum + Number(qty || 0), 0); }
function cartProducts() {
  return Object.entries(cart).map(([id, qty]) => {
    const product = products.find((item) => String(item.id) === String(id));
    return product ? { product: product, quantity: Number(qty) } : null;
  }).filter(Boolean);
}
function getSubtotal() {
  return cartProducts().reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
}
function getDeliveryFee() {
  const subtotal = getSubtotal();
  if (!subtotal) return 0;
  return subtotal >= FREE_DELIVERY_MINIMUM ? 0 : STANDARD_DELIVERY_FEE;
}
function toast(message, type) {
  const region = $("#toastRegion");
  const node = document.createElement("div");
  node.className = "toast" + (type === "error" ? " error" : "");
  node.textContent = message;
  region.appendChild(node);
  window.setTimeout(() => node.remove(), 3800);
}
async function request(path, options) {
  const settings = Object.assign({ method: "GET", headers: {} }, options || {});
  settings.headers = Object.assign({}, settings.headers);
  if (token) settings.headers.Authorization = "Bearer " + token;
  if (settings.body && typeof settings.body !== "string") {
    settings.headers["Content-Type"] = "application/json";
    settings.body = JSON.stringify(settings.body);
  }
  const response = await fetch(API + path, settings);
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch (_) { data = { detail: raw || "Unexpected server response." }; }
  if (!response.ok) {
    if (response.status === 401 && token) {
      token = "";
      currentUser = null;
      localStorage.removeItem("vegz_token");
    }
    throw new Error(data.detail || data.message || "Something went wrong. Please try again.");
  }
  return data;
}

async function loadProducts() {
  try {
    try {
      const config = await request("/api/store-config");
      FREE_DELIVERY_MINIMUM = Number(config.free_delivery_minimum || FREE_DELIVERY_MINIMUM);
      STANDARD_DELIVERY_FEE = Number(config.delivery_fee || STANDARD_DELIVERY_FEE);
    } catch (_) {}
    products = await request("/api/products");
    const ids = new Set(products.map((product) => String(product.id)));
    Object.keys(cart).forEach((id) => { if (!ids.has(String(id))) delete cart[id]; });
    saveCart();
    renderCategories();
    renderProducts();
    renderCart();
  } catch (error) {
    $("#productGrid").innerHTML = '<div class="empty-results"><span>🌱</span><strong>We could not load the fresh picks.</strong><p>' + escapeHtml(error.message) + '</p><button class="flow-primary" id="retryProductsButton" type="button">Try again <span>↻</span></button></div>';
  }
}

function renderCategories() {
  const departmentProducts = products.filter((product) => departmentFor(product) === activeDepartment);
  const categories = ["all"].concat(Array.from(new Set(departmentProducts.map((product) => product.category))).filter(Boolean));
  $("#categoryFilters").innerHTML = categories.map((category) => {
    const active = activeCategory === category ? " selected" : "";
    const label = category === "all" ? "All items" : category;
    return '<button class="category-chip' + active + '" data-category="' + escapeHtml(category) + '" type="button">' +
      escapeHtml(label) + (category === "all" ? ' <span>↗</span>' : "") + '</button>';
  }).join("");
}

function renderProducts() {
  const filtered = products.filter((product) => {
    const matchesDepartment = departmentFor(product) === activeDepartment;
    const matchesCategory = activeCategory === "all" || product.category === activeCategory;
    const haystack = (product.name + " " + product.category + " " + product.description).toLowerCase();
    return matchesDepartment && matchesCategory && haystack.includes(query.toLowerCase());
  });
  if (!filtered.length) {
    $("#productGrid").innerHTML = '<div class="empty-results"><span>🌿</span><strong>No fresh picks found.</strong><p>Try another search or category.</p><button class="flow-back" id="clearSearchButton" type="button">Clear filters</button></div>';
    return;
  }
  $("#productGrid").innerHTML = filtered.map((product, index) => {
    const qty = Number(cart[product.id] || 0);
    const image = escapeHtml(product.image_url || "");
    const name = escapeHtml(product.name);
    const slug = escapeHtml(product.slug);
    return '<article class="product-card" style="animation-delay:' + Math.min(index * 45, 240) + 'ms">' +
      '<div class="product-image"><img src="' + image + '" alt="' + name + '" loading="lazy"><span class="product-emoji" aria-hidden="true">' + iconFor(product) + '</span><span class="product-badge">FRESH PICK</span></div>' +
      '<div class="product-info"><span class="product-category">' + escapeHtml(product.category) + '</span><h3 class="product-name">' + name + '</h3>' +
      '<p class="product-description">' + escapeHtml(product.description) + '</p><div class="product-foot"><div class="product-price">' + currency(product.price) + '<small>per ' + escapeHtml(product.unit) + '</small></div>' +
      '<button class="add-button' + (qty ? " added" : "") + '" data-add="' + product.id + '" type="button" aria-label="Add ' + name + ' to basket">' + (qty ? qty + " in +" : "+") + '</button></div></div></article>';
  }).join("");
  $(".product-image img").forEach((image) => {
    image.addEventListener("error", () => image.parentElement.classList.add("image-fallback"), { once: true });
    if (image.complete && image.naturalWidth === 0) image.parentElement.classList.add("image-fallback");
  });
}

function renderCart() {
  const entries = cartProducts();
  const count = itemCount();
  const subtotal = getSubtotal();
  const delivery = getDeliveryFee();
  const total = subtotal + delivery;
  $("#cartCount").textContent = String(count);
  $("#subtotalValue").textContent = currency(subtotal);
  $("#deliveryValue").textContent = !subtotal ? "—" : delivery ? currency(delivery) : "FREE";
  $("#totalValue").textContent = currency(total);
  $("#checkoutButton").disabled = count === 0;
  $("#mobileCartBar").hidden = count === 0;
  $("#mobileCartTotal").textContent = currency(total);
  $("#mobileCartCount").textContent = count + (count === 1 ? " item" : " items");
  $("#progressFill").style.width = Math.min(100, subtotal / FREE_DELIVERY_MINIMUM * 100) + "%";
  $("#deliveryNote").textContent = !subtotal
    ? "Add vegetables to get started."
    : subtotal >= FREE_DELIVERY_MINIMUM
      ? "Lovely! Your delivery is on us."
      : "Add " + currency(FREE_DELIVERY_MINIMUM - subtotal) + " more for free delivery.";

  if (!entries.length) {
    $("#cartItems").innerHTML = '<div class="empty-cart"><span class="empty-cart-art">🥬</span><strong>Your basket is taking a nap</strong><p>Add some fresh favourites and they will show up here.</p></div>';
  } else {
    $("#cartItems").innerHTML = entries.map(({ product, quantity }) => {
      const image = escapeHtml(product.image_url || "");
      return '<div class="cart-row"><div class="cart-thumb"><img src="' + image + '" alt=""><span aria-hidden="true">' + iconFor(product) + '</span></div>' +
        '<div><div class="cart-row-name">' + escapeHtml(product.name) + '</div><div class="cart-row-price">' + currency(product.price) + ' / ' + escapeHtml(product.unit) + '</div>' +
        '<div class="quantity-controls"><button type="button" data-minus="' + product.id + '" aria-label="Decrease ' + escapeHtml(product.name) + ' quantity">−</button><span>' + quantity + '</span><button type="button" data-add="' + product.id + '" aria-label="Increase ' + escapeHtml(product.name) + ' quantity">+</button></div></div>' +
        '<div class="cart-row-total">' + currency(Number(product.price) * quantity) + '<button class="remove-line" type="button" data-remove="' + product.id + '">Remove</button></div></div>';
    }).join("");
    $$(".cart-thumb img").forEach((image) => {
      image.addEventListener("error", () => {
        image.parentElement.classList.add("fallback");
        image.parentElement.firstElementChild.style.display = "none";
      }, { once: true });
    });
  }
}

function addToCart(id) {
  const product = products.find((item) => String(item.id) === String(id));
  if (!product) return;
  const cartDepartments = new Set(cartProducts().map((item) => departmentFor(item.product)));
  const nextDepartment = departmentFor(product);
  if (cartDepartments.size && !cartDepartments.has(nextDepartment)) {
    toast("Vegetables and grocery have separate suppliers and deliveries. Please place or clear your " + Array.from(cartDepartments).map(departmentLabel).join(" + ") + " basket before adding " + departmentLabel(nextDepartment).toLowerCase() + " items.", "error");
    return;
  }
  const current = Number(cart[id] || 0);
  if (current >= Math.min(99, Number(product.stock_qty || 99))) {
    toast("That is all the available stock for " + product.name + ".", "error");
    return;
  }
  cart[id] = current + 1;
  saveCart();
  renderProducts();
  renderCart();
}
function decreaseCart(id) {
  const qty = Number(cart[id] || 0);
  if (qty <= 1) delete cart[id]; else cart[id] = qty - 1;
  saveCart();
  renderProducts();
  renderCart();
}
function removeCart(id) {
  delete cart[id];
  saveCart();
  renderProducts();
  renderCart();
}

function showFlow(stage) {
  $("#flowModal").hidden = false;
  document.body.classList.add("modal-open");
  renderFlow(stage);
}
function closeFlow() {
  $("#flowModal").hidden = true;
  document.body.classList.remove("modal-open");
}
function stepHeader(number, label) {
  return '<div class="flow-step"><span>' + number + '</span>' + label + '</div>';
}
function renderFlow(stage) {
  const content = $("#flowContent");
  if (stage === "phone") {
    content.innerHTML = stepHeader("1", "Secure sign in") +
      '<h2 id="flowTitle">Let us get you home.</h2><p class="flow-description">Enter your mobile number to continue. We will verify it with a one-time code before saving your order.</p>' +
      '<form class="flow-form" id="requestOtpForm"><label class="field-label">Mobile number<div class="phone-input-wrap"><span class="country-code">🇮🇳 +91</span><input class="flow-input" id="phoneInput" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" pattern="[0-9]{10}" minlength="10" maxlength="10" placeholder="10-digit mobile number" required></div></label>' +
      '<button class="flow-primary" type="submit">Send verification code <span>→</span></button></form>' +
      '<p class="flow-footer-note"><span>✦</span> Your number helps us coordinate delivery updates. We never show it publicly.</p>';
    bindForm("requestOtpForm", submitOtpRequest);
  } else if (stage === "otp") {
    content.innerHTML = stepHeader("1", "Verify mobile number") +
      '<h2 id="flowTitle">Check your messages.</h2><p class="flow-description">Enter the 6-digit code for <strong>' + escapeHtml(pendingPhone) + '</strong>.</p>' +
      '<form class="flow-form" id="verifyOtpForm"><label class="field-label">One-time password<div class="otp-boxes"><input class="flow-input" name="d1" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code" required aria-label="First OTP digit"><input class="flow-input" name="d2" type="text" inputmode="numeric" maxlength="1" required aria-label="Second OTP digit"><input class="flow-input" name="d3" type="text" inputmode="numeric" maxlength="1" required aria-label="Third OTP digit"><input class="flow-input" name="d4" type="text" inputmode="numeric" maxlength="1" required aria-label="Fourth OTP digit"><input class="flow-input" name="d5" type="text" inputmode="numeric" maxlength="1" required aria-label="Fifth OTP digit"><input class="flow-input" name="d6" type="text" inputmode="numeric" maxlength="1" required aria-label="Sixth OTP digit"></div></label>' +
      '<div id="otpStatus" class="flow-inline">' + (demoOtp ? "Development demo code: " + escapeHtml(demoOtp) + " (SMS is not configured yet)." : "The code expires in a few minutes.") + '</div>' +
      '<button class="flow-primary" type="submit">Verify and continue <span>→</span></button></form><button class="flow-back" id="changePhoneButton" type="button">← Change mobile number</button>';
    bindForm("verifyOtpForm", submitOtpVerify);
    const inputs = $$(".otp-boxes input");
    inputs.forEach((input, index) => {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(-1);
        if (input.value && inputs[index + 1]) inputs[index + 1].focus();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && inputs[index - 1]) inputs[index - 1].focus();
      });
      input.addEventListener("paste", (event) => {
        const pasted = (event.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
        if (pasted) {
          event.preventDefault();
          inputs.forEach((box, i) => { box.value = pasted[i] || ""; });
          inputs[Math.min(pasted.length, 5)].focus();
        }
      });
    });
    $("#changePhoneButton").addEventListener("click", () => renderFlow("phone"));
    if (inputs[0]) inputs[0].focus();
  } else if (stage === "address") {
    const addressCards = savedAddresses.length ? '<div class="saved-address-list">' + savedAddresses.map((address) => {
      const details = [address.line1, address.line2, address.landmark, address.city, address.state, address.postal_code].filter(Boolean).join(", ");
      return '<label class="saved-address-option"><input type="radio" name="savedAddress" value="' + address.id + '"' + (String(selectedAddressId) === String(address.id) ? " checked" : "") + '><span><strong>' + escapeHtml(address.label || "Delivery address") + (address.is_default ? " · Default" : "") + '</strong><small>' + escapeHtml(address.recipient_name) + " · " + escapeHtml(details) + '</small><small>' + escapeHtml(address.phone) + '</small></span></label>';
    }).join("") + '</div><button class="address-toggle" id="addNewAddressButton" type="button">＋ Add a new address</button>' : "";
    const addressForm = showAddressForm ? '<form class="flow-form" id="addressForm"><div class="form-grid">' +
      '<label class="field-label">Name<input class="flow-input" name="recipient_name" autocomplete="name" value="' + escapeHtml(currentUser && currentUser.full_name || "") + '" placeholder="Who should receive it?" required></label>' +
      '<label class="field-label">Mobile number<input class="flow-input" name="phone" type="tel" autocomplete="tel" value="' + escapeHtml(currentUser && currentUser.phone || pendingPhone) + '" required></label>' +
      '<label class="field-label full-field">Address line 1<input class="flow-input" name="line1" autocomplete="address-line1" placeholder="House / flat, street" required></label>' +
      '<label class="field-label full-field">Address line 2 <span>(optional)</span><input class="flow-input" name="line2" autocomplete="address-line2" placeholder="Area, apartment, etc."></label>' +
      '<label class="field-label full-field">Landmark <span>(optional)</span><input class="flow-input" name="landmark" placeholder="Near a landmark"></label>' +
      '<label class="field-label">City<input class="flow-input" name="city" autocomplete="address-level2" placeholder="City" required></label>' +
      '<label class="field-label">State<input class="flow-input" name="state" autocomplete="address-level1" placeholder="State" required></label>' +
      '<label class="field-label">PIN code<input class="flow-input" name="postal_code" autocomplete="postal-code" inputmode="numeric" minlength="4" maxlength="12" placeholder="PIN code" required></label>' +
      '<label class="field-label">Address type<select class="flow-select" name="label"><option>Home</option><option>Work</option><option>Other</option></select></label></div>' +
      '<button class="flow-primary" type="submit">Save address and continue <span>→</span></button></form>' : "";
    content.innerHTML = stepHeader("2", "Delivery details") +
      '<h2 id="flowTitle">Where should we bring it?</h2><p class="flow-description">Share a delivery address so your fresh picks reach the right doorstep.</p>' +
      (addressCards ? addressCards : "") +
      (!showAddressForm && savedAddresses.length ? '<button class="flow-primary" id="useAddressButton" type="button">Use selected address <span>→</span></button>' : "") +
      addressForm +
      (savedAddresses.length ? '<button class="flow-back" id="backToCartButton" type="button">← Back to basket</button>' : '');
    if ($("#addressForm")) bindForm("addressForm", submitAddress);
    if ($("#addNewAddressButton")) $("#addNewAddressButton").addEventListener("click", () => { showAddressForm = true; renderFlow("address"); });
    if ($("#useAddressButton")) $("#useAddressButton").addEventListener("click", continueWithSavedAddress);
    if ($("#backToCartButton")) $("#backToCartButton").addEventListener("click", closeFlow);
    $$('input[name="savedAddress"]').forEach((radio) => radio.addEventListener("change", () => { selectedAddressId = Number(radio.value); }));
  } else if (stage === "payment") {
    const subtotal = getSubtotal();
    const delivery = getDeliveryFee();
    content.innerHTML = stepHeader("3", "Payment") +
      '<h2 id="flowTitle">The final little detail.</h2><p class="flow-description">Choose how you would like to pay for your order.</p>' +
      '<div class="payment-options"><label class="payment-option"><input type="radio" name="paymentMethod" value="cod" checked><span class="payment-symbol">₹</span><span><strong>Cash on Delivery</strong><small>Pay when your vegetables arrive.</small></span></label>' +
      '<label class="payment-option"><input type="radio" name="paymentMethod" value="online"><span class="payment-symbol">↗</span><span><strong>Pay online</strong><small>Payment gateway setup is pending; order will remain unpaid.</small></span></label></div>' +
      '<div class="checkout-review"><div class="review-row"><span>Vegetables subtotal</span><strong>' + currency(subtotal) + '</strong></div><div class="review-row"><span>Delivery</span><strong>' + (delivery ? currency(delivery) : "FREE") + '</strong></div><div class="review-row review-total"><span>Order total</span><strong>' + currency(subtotal + delivery) + '</strong></div></div>' +
      '<button class="flow-primary" id="placeOrderButton" type="button">Place my order <span>→</span></button><button class="flow-back" id="backToAddressButton" type="button">← Back to address</button>' +
      '<p class="flow-footer-note"><span>✦</span> Prices and stock are verified again by the server when you place the order.</p>';
    $("#placeOrderButton").addEventListener("click", placeOrder);
    $("#backToAddressButton").addEventListener("click", () => openAddressStage());
  } else if (stage === "success") {
    const order = activeOrder || {};
    content.innerHTML = '<div class="success-copy"><div class="success-scene"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"></path></svg></div><div class="eyebrow" style="justify-content:center">THAT IS A FRESH CHOICE</div>' +
      '<h2 id="flowTitle">Your order is in motion.</h2><p>' + escapeHtml(order.message || "Thank you for shopping with Vegz. We are getting your order ready.") + '</p></div>' +
      '<div class="tracking-code">YOUR VEGZ ORDER<strong>' + escapeHtml(order.tracking_code || ("VGZ-" + order.id)) + '</strong></div>' +
      '<div class="checkout-review"><div class="review-row"><span>Order number</span><strong>#' + escapeHtml(order.id) + '</strong></div><div class="review-row"><span>Payment</span><strong>' + escapeHtml(order.payment_method === "cod" ? "Cash on Delivery" : "Online · Pending") + '</strong></div><div class="review-row review-total"><span>Total</span><strong>' + currency(order.total_amount) + '</strong></div></div>' +
      '<button class="flow-primary" id="trackNewOrderButton" type="button">Track my delivery <span>→</span></button><button class="flow-back" id="continueShoppingButton" type="button">Continue shopping</button>';
    $("#trackNewOrderButton").addEventListener("click", () => trackOrder(order.id));
    $("#continueShoppingButton").addEventListener("click", closeFlow);
  } else if (stage === "orders") {
    content.innerHTML = stepHeader("↗", "Order history") + '<h2 id="flowTitle">Your Vegz orders.</h2><p class="flow-description">A little history of the good things you have ordered.</p><div id="ordersList"><div class="loading-state"><span class="loader"></span><p>Loading your orders…</p></div></div><button class="flow-back" id="ordersBackButton" type="button">← Back to shopping</button>';
    $("#ordersBackButton").addEventListener("click", closeFlow);
    loadOrders();
  } else if (stage === "tracking") {
    const order = activeOrder || {};
    content.innerHTML = stepHeader("↗", "Live order status") +
      '<h2 id="flowTitle">Freshness is on its way.</h2><p class="flow-description">Track progress for order #' + escapeHtml(order.order_id || order.id) + '.</p>' +
      '<div class="tracking-code">TRACKING CODE<strong>' + escapeHtml(order.tracking_code || "") + '</strong></div>' +
      '<div id="trackingSteps"><div class="loading-state"><span class="loader"></span><p>Checking the latest status…</p></div></div>' +
      '<button class="flow-primary" id="refreshTrackingButton" type="button">Refresh status <span>↻</span></button><button class="flow-back" id="trackingOrdersButton" type="button">View all orders</button>';
    $("#refreshTrackingButton").addEventListener("click", () => trackOrder(order.order_id || order.id));
    $("#trackingOrdersButton").addEventListener("click", () => renderFlow("orders"));
    loadTracking(order.order_id || order.id);
  }
}

function bindForm(id, handler) {
  const form = $("#" + id);
  if (form) form.addEventListener("submit", (event) => { event.preventDefault(); handler(new FormData(form), form); });
}
function phoneWithIndiaCode(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return "+91" + digits.slice(-10);
}
async function submitOtpRequest(formData, form) {
  const phone = phoneWithIndiaCode(formData.get("phone"));
  if (phone.replace(/\D/g, "").length !== 12) { toast("Enter a valid 10-digit mobile number.", "error"); return; }
  const button = $('button[type="submit"]', form);
  button.disabled = true;
  button.innerHTML = "Requesting code…";
  try {
    const response = await request("/api/auth/request-otp", { method: "POST", body: { phone: phone } });
    pendingPhone = phone;
    demoOtp = response.demo_otp || "";
    renderFlow("otp");
    if (!demoOtp) toast("A verification code has been requested. Check your SMS.");
  } catch (error) { toast(error.message, "error"); }
  finally { if (button.isConnected) { button.disabled = false; button.innerHTML = 'Send verification code <span>→</span>'; } }
}
async function submitOtpVerify(formData, form) {
  const otp = ["d1","d2","d3","d4","d5","d6"].map((key) => String(formData.get(key) || "")).join("");
  if (!/^\d{6}$/.test(otp)) { toast("Enter all 6 digits of the verification code.", "error"); return; }
  const button = $('button[type="submit"]', form);
  button.disabled = true;
  button.innerHTML = "Verifying…";
  try {
    const response = await request("/api/auth/verify-otp", { method: "POST", body: { phone: pendingPhone, otp: otp } });
    token = response.access_token;
    currentUser = response.user;
    localStorage.setItem("vegz_token", token);
    demoOtp = "";
    if (postAuthAction === "orders") renderFlow("orders");
    else await openAddressStage();
  } catch (error) { toast(error.message, "error"); }
  finally { if (button.isConnected) { button.disabled = false; button.innerHTML = 'Verify and continue <span>→</span>'; } }
}
async function openAddressStage() {
  try {
    if (!currentUser) currentUser = await request("/api/me");
    savedAddresses = await request("/api/addresses");
    selectedAddressId = (savedAddresses.find((address) => address.is_default) || savedAddresses[0] || {}).id || null;
    showAddressForm = savedAddresses.length === 0;
    showFlow("address");
  } catch (error) {
    if (error.message.toLowerCase().includes("sign in") || error.message.toLowerCase().includes("session")) {
      postAuthAction = "checkout";
      renderFlow("phone");
    } else toast(error.message, "error");
  }
}
async function submitAddress(formData, form) {
  const button = $('button[type="submit"]', form);
  button.disabled = true;
  button.innerHTML = "Saving address…";
  const body = {
    recipient_name: formData.get("recipient_name"),
    phone: formData.get("phone"),
    line1: formData.get("line1"),
    line2: formData.get("line2") || "",
    landmark: formData.get("landmark") || "",
    city: formData.get("city"),
    state: formData.get("state"),
    postal_code: formData.get("postal_code"),
    label: formData.get("label") || "Home",
    is_default: savedAddresses.length === 0
  };
  try {
    const address = await request("/api/addresses", { method: "POST", body: body });
    savedAddresses.unshift(address);
    selectedAddressId = address.id;
    showAddressForm = false;
    renderFlow("payment");
  } catch (error) { toast(error.message, "error"); }
  finally { if (button.isConnected) { button.disabled = false; button.innerHTML = 'Save address and continue <span>→</span>'; } }
}
function continueWithSavedAddress() {
  const selected = $('input[name="savedAddress"]:checked');
  if (selected) selectedAddressId = Number(selected.value);
  if (!selectedAddressId) { toast("Choose a saved address or add a new one.", "error"); return; }
  showFlow("payment");
}
async function placeOrder() {
  if (!selectedAddressId) { toast("Choose a delivery address first.", "error"); return; }
  if (!itemCount()) { toast("Your basket is empty.", "error"); closeFlow(); return; }
  const button = $("#placeOrderButton");
  const payment = $('input[name="paymentMethod"]:checked');
  button.disabled = true;
  button.innerHTML = "Placing your order…";
  const body = {
    address_id: selectedAddressId,
    payment_method: payment ? payment.value : "cod",
    items: cartProducts().map((item) => ({ product_id: item.product.id, quantity: item.quantity }))
  };
  try {
    activeOrder = await request("/api/orders", { method: "POST", body: body });
    cart = {};
    saveCart();
    renderProducts();
    renderCart();
    await loadProducts();
    showFlow("success");
  } catch (error) {
    toast(error.message, "error");
    if (error.message.toLowerCase().includes("address")) await openAddressStage();
  } finally {
    if (button.isConnected) { button.disabled = false; button.innerHTML = 'Place my order <span>→</span>'; }
  }
}
async function loadOrders() {
  const target = $("#ordersList");
  if (!target) return;
  try {
    const orders = await request("/api/orders");
    target.innerHTML = orders.length ? orders.map((order) => {
      return '<div class="order-card"><div class="order-card-head"><div><strong>Order #' + escapeHtml(order.id) + '</strong><small>' + escapeHtml(new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })) + '</small></div><span class="order-status">' + escapeHtml(String(order.status).replace(/_/g, " ")) + '</span></div>' +
        '<div class="order-card-foot"><strong>' + currency(order.total_amount) + '</strong><button type="button" data-track="' + order.id + '">Track order →</button></div></div>';
    }).join("") : '<div class="empty-results"><span>🧺</span><strong>No orders yet</strong><p>Your first fresh basket is just around the corner.</p></div>';
  } catch (error) { target.innerHTML = '<p class="flow-description">' + escapeHtml(error.message) + '</p>'; }
}
async function trackOrder(id) {
  activeOrder = { order_id: Number(id), id: Number(id) };
  showFlow("tracking");
}
async function loadTracking(id) {
  try {
    const info = await request("/api/orders/" + encodeURIComponent(id) + "/track");
    activeOrder = info;
    const target = $("#trackingSteps");
    if (!target) return;
    target.innerHTML = '<div class="tracking-steps">' + info.steps.map((step) => {
      return '<div class="tracking-step' + (step.complete ? " complete" : "") + (step.current ? " current" : "") + '"><span class="tracking-step-icon">' + (step.complete ? "✓" : "·") + '</span><div><strong>' + escapeHtml(step.label) + '</strong><small>' + (step.current ? "Current status" : step.complete ? "Completed" : "Coming up next") + '</small></div></div>';
    }).join("") + '</div><div class="checkout-review"><div class="review-row"><span>Current status</span><strong>' + escapeHtml(String(info.status).replace(/_/g, " ")) + '</strong></div><div class="review-row"><span>Payment status</span><strong>' + escapeHtml(info.payment_status) + '</strong></div><div class="review-row"><span>Last update</span><strong>' + escapeHtml(new Date(info.updated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })) + '</strong></div></div>' +
      '<p class="flow-footer-note"><span>✦</span> This demo displays the latest status saved by the Vegz API. Live agent GPS tracking can be connected to the delivery-agent module.</p>';
  } catch (error) {
    const target = $("#trackingSteps");
    if (target) target.innerHTML = '<p class="flow-description">' + escapeHtml(error.message) + '</p>';
  }
}

function beginCheckout() {
  if (!itemCount()) { toast("Add a few fresh picks to your basket first."); return; }
  postAuthAction = "checkout";
  if (!token) showFlow("phone");
  else openAddressStage();
}
function beginOrders() {
  postAuthAction = "orders";
  if (!token) showFlow("phone");
  else showFlow("orders");
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target) return;
  const add = target.closest("[data-add]");
  const minus = target.closest("[data-minus]");
  const remove = target.closest("[data-remove]");
  const category = target.closest("[data-category]");
  const track = target.closest("[data-track]");
  if (add) { addToCart(add.dataset.add); return; }
  if (minus) { decreaseCart(minus.dataset.minus); return; }
  if (remove) { removeCart(remove.dataset.remove); return; }
  const department = target.closest("[data-department]");
  if (department) {
    activeDepartment = department.dataset.department;
    activeCategory = "all";
    $$$("#departmentTabs [data-department]").forEach((button) => {
      const selected = button.dataset.department === activeDepartment;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    renderCategories();
    renderProducts();
    return;
  }
  if (category) {
    activeCategory = category.dataset.category;
    renderCategories();
    renderProducts();
    return;
  }
  if (track) { trackOrder(track.dataset.track); return; }
  if (target.id === "retryProductsButton") loadProducts();
  if (target.id === "clearSearchButton") {
    query = "";
    activeCategory = "all";
    $("#searchInput").value = "";
    renderCategories();
    renderProducts();
  }
});
$("#checkoutButton").addEventListener("click", beginCheckout);
$("#mobileCheckoutButton").addEventListener("click", () => {
  $("#cartPanel").scrollIntoView({ behavior: "smooth", block: "center" });
  beginCheckout();
});
$("#cartFocusButton").addEventListener("click", () => $("#cartPanel").scrollIntoView({ behavior: "smooth", block: "center" }));
$("#searchFocusButton").addEventListener("click", () => {
  $("#searchInput").focus();
  $("#shop").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#ordersButton").addEventListener("click", beginOrders);
$("#closeModalButton").addEventListener("click", closeFlow);
$("#flowModal").addEventListener("click", (event) => { if (event.target === $("#flowModal")) closeFlow(); });
$("#searchInput").addEventListener("input", (event) => { query = event.target.value.trim(); renderProducts(); });
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("#searchInput").focus();
    $("#shop").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (event.key === "Escape" && !$("#flowModal").hidden) closeFlow();
});
$("#yearLabel").textContent = String(new Date().getFullYear());

loadProducts();
if (token) {
  request("/api/me").then((user) => { currentUser = user; }).catch(() => { token = ""; });
}
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
