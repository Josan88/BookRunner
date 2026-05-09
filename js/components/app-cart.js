const Cart = {
  data() {
    return {
      cart: [],
      selectedItems: [],
    };
  },

  inject: ["authState"],

  computed: {
    totalPrice() {
      return this.selectedItems.reduce(
        (sum, item) => sum + parseFloat(item.price) * item.quantity,
        0
      );
    },

    deliveryFee() {
      return this.hasSelectedItems ? this.totalPrice * 0.1 : 0;
    },

    totalWithDelivery() {
      return this.totalPrice + this.deliveryFee;
    },

    allItemsSelected() {
      return this.cart.length > 0 && this.cart.every(item => item.selected);
    },

    selectedCount() {
      return this.selectedItems.length;
    },

    hasSelectedItems() {
      return this.selectedCount > 0;
    },
  },

  methods: {
    clearCart() {
      this.cart = [];
      this.selectedItems = [];
    },

    expireSession() {
      this.clearCart();
      this.authState.isLoggedIn = false;
      this.authState.user = null;
    },

    fetchCart() {
      const token = this.authState.user?.token;
      if (this.authState.isLoggedIn && token) {
        fetch("resources/api_cart.php", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(async (res) => {
            const data = await res.json().catch(() => null);

            if (res.status === 401) {
              this.expireSession();
              return [];
            }

            if (!res.ok || !Array.isArray(data)) {
              this.clearCart();
              return [];
            }

            return data;
          })
          .then(data => {
            if (!Array.isArray(data)) {
              return;
            }

            this.cart = data.map(item => ({ ...item, selected: false }));
            this.updateSelectedItems();
          })
          .catch(() => this.clearCart());
      } else {
        this.clearCart();
      }
    },

    toggleSelect(item) {
      item.selected = !item.selected;
      this.updateSelectedItems();
    },

    toggleSelectAll() {
      const newState = !this.allItemsSelected;
      this.cart.forEach(item => (item.selected = newState));
      this.updateSelectedItems();
    },

    updateSelectedItems() {
      this.selectedItems = this.cart.filter(item => item.selected);
    },

    removeFromCart(id) {
      const token = this.authState.user?.token;
      if (!token) {
        return;
      }

      fetch(`resources/api_cart.php/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null);

          if (res.status === 401) {
            this.expireSession();
            return;
          }

          if (!res.ok || data?.error) {
            alert("Failed to remove item.");
            return;
          }

          this.fetchCart();
        })
        .catch(() => alert("An error occurred."));
    },

    updateQuantity(item) {
      const token = this.authState.user?.token;
      if (!token) {
        return;
      }

      fetch(`resources/api_cart.php/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ quantity: item.quantity }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null);

          if (res.status === 401) {
            this.expireSession();
            return;
          }

          if (!res.ok || data?.error) {
            alert("Failed to update quantity.");
            return;
          }

          this.fetchCart();
        })
        .catch(() => alert("Error updating quantity."));
    },

    increaseQty(item) {
      if (item.quantity < 10) {
        item.quantity++;
        this.updateQuantity(item);
      }
    },

    decreaseQty(item) {
      if (item.quantity > 1) {
        item.quantity--;
        this.updateQuantity(item);
      }
    },

    purchaseCart() {
      const token = this.authState.user?.token;

      if (!this.authState.isLoggedIn || !token) {
        alert("You must be logged in to purchase.");
        return;
      }
      if (!this.hasSelectedItems) {
        alert("Please select items to purchase.");
        return;
      }

      const cartItemIds = this.selectedItems.map(({ id }) => id);

      fetch("resources/api_orders.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cart_item_ids: cartItemIds,
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null);

          if (res.status === 401) {
            this.expireSession();
            return;
          }

          if (res.ok && data?.id) {
            this.fetchCart();
          } else {
            alert("Failed to complete purchase.");
          }
        })
        .catch(() => alert("An error occurred during purchase."));
    },
  },

  mounted() {
    this.fetchCart();
  },

  template: `
    <div class="container-fluid px-2 px-md-4 py-4" style="background-color: #f8f9fa; min-height: 100vh;">
    <div class="row justify-content-center">
      <div class="col-12 col-lg-10 col-xl-8">

        <!-- Title -->
        <h2 class="text-center mb-4 fw-bold">
          My Cart
          <span v-if="cart.length > 0" class="badge text-white ms-2"
                style="background: linear-gradient(135deg, #0d6efd, #4facfe);">
            {{ cart.length }}
          </span>
        </h2>

        <!-- Not Logged In Message -->
        <div v-if="!authState.isLoggedIn" class="alert alert-danger text-center mb-4">
          You must be logged in to view and manage your cart.
        </div>

        <!-- Authenticated Cart -->
        <template v-if="authState.isLoggedIn">

          <!-- Selection Summary -->
          <div v-if="cart.length > 0" class="bg-white rounded shadow-sm p-3 mb-3">
            <div class="d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center">
                <div class="form-check me-3">
                  <input class="form-check-input" type="checkbox" :checked="allItemsSelected" @change="toggleSelectAll()"
                        id="selectAll" style="border: 2px solid #0d6efd;">
                  <label class="form-check-label fw-semibold" for="selectAll">Select All</label>
                </div>
                <span class="text-muted small">{{ selectedCount }} of {{ cart.length }} items selected</span>
              </div>
              <div v-if="hasSelectedItems" class="text-primary fw-semibold">
                Selected Total: RM{{ totalWithDelivery.toFixed(2) }}
              </div>
            </div>
          </div>

          <!-- Desktop View -->
          <div class="bg-white rounded shadow-sm overflow-hidden d-none d-md-block">
            <!-- Table Header -->
            <div class="row g-0 text-white fw-semibold" style="background: linear-gradient(135deg, #0d6efd, #4facfe);">
              <div class="col-1 p-3 text-center border-end border-white border-opacity-25">Select</div>
              <div class="col-5 p-3 text-center border-end border-white border-opacity-25">Product</div>
              <div class="col-2 p-3 text-center border-end border-white border-opacity-25">Quantity</div>
              <div class="col-4 p-3 text-center">Subtotal</div>
            </div>

            <!-- Empty Cart Message -->
            <div v-if="cart.length === 0" class="p-5 text-center">
              <i class="bi bi-cart-x display-1 text-muted mb-3"></i>
              <p class="fs-4 text-muted mb-0">Your cart is empty</p>
              <p class="text-muted">Add some books to get started!</p>
            </div>

            <!-- Cart Items -->
            <div v-else>
              <div v-for="(item, index) in cart" :key="item.id" class="row g-0 align-items-center border-bottom">
                <!-- Select -->
                <div class="col-1 p-3 text-center">
                  <input class="form-check-input" type="checkbox" :checked="item.selected"
                        @change="toggleSelect(item)" :id="'item-' + item.id" style="border: 2px solid #0d6efd;">
                </div>

                <!-- Product -->
                <div class="col-5 p-3">
                  <div class="d-flex align-items-center">
                    <img :src="item.cover" :alt="item.book_title" class="rounded me-3" 
                        style="width: 60px; height: 80px; object-fit: cover;">
                    <div class="flex-grow-1">
                      <h6 class="fw-semibold mb-1">{{ item.book_title }} Vol. {{ item.volume }}</h6>
                      <p class="text-muted small mb-1">Price: RM{{ parseFloat(item.price).toFixed(2) }}</p>
                      <button class="btn btn-link text-danger p-0 small" @click="removeFromCart(item.id)">
                        <i class="bi bi-trash me-1"></i>Remove
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Quantity -->
                <div class="col-2 p-3">
                  <div class="input-group input-group-sm mx-auto" style="max-width: 120px;">
                    <button class="btn btn-outline-secondary" @click="decreaseQty(item)">
                      <i class="bi bi-dash"></i>
                    </button>
                    <input type="text" class="form-control text-center fw-semibold border-start-0 border-end-0"
                          :value="item.quantity" readonly max="10">
                    <button class="btn btn-outline-secondary" @click="increaseQty(item)">
                      <i class="bi bi-plus"></i>
                    </button>
                  </div>
                </div>

                <!-- Subtotal -->
                <div class="col-4 p-3 text-center">
                  <span :class="{ 'fw-bold text-primary': item.selected }">
                    RM{{ (parseFloat(item.price) * item.quantity).toFixed(2) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Mobile View -->
          <div class="d-block d-md-none">
            <!-- Empty Cart -->
            <div v-if="cart.length === 0" class="bg-white rounded shadow-sm p-4 text-center">
              <i class="bi bi-cart-x display-1 text-muted mb-3"></i>
              <p class="fs-5 text-muted mb-0">Your cart is empty</p>
              <p class="text-muted">Add some books to get started!</p>
            </div>

            <!-- Mobile Cart Cards -->
            <div v-else>
              <div v-for="item in cart" :key="item.id" class="bg-white rounded shadow-sm p-3 mb-3 position-relative">
                <div class="position-absolute top-0 end-0 m-2">
                  <input class="form-check-input" type="checkbox" :checked="item.selected"
                        @change="toggleSelect(item)" :id="'mobile-item-' + item.id"
                        style="border: 2px solid #0d6efd;">
                </div>

                <div class="d-flex mb-3">
                  <img :src="item.cover" :alt="item.book_title" class="rounded me-3"
                      style="width: 80px; height: 100px; object-fit: cover;">
                  <div class="flex-grow-1">
                    <h6 class="fw-semibold mb-2">{{ item.book_title }} Vol. {{ item.volume }}</h6>
                    <p class="text-muted small mb-2">Unit Price: RM{{ parseFloat(item.price).toFixed(2) }}</p>
                    <p class="fw-bold mb-0" :class="{ 'text-primary': item.selected }">
                      Subtotal: RM{{ (parseFloat(item.price) * item.quantity).toFixed(2) }}
                    </p>
                  </div>
                </div>

                <div class="d-flex justify-content-between align-items-center">
                  <div class="d-flex align-items-center">
                    <span class="me-2 fw-semibold">Qty:</span>
                    <div class="input-group input-group-sm" style="width: 120px;">
                      <button class="btn btn-outline-secondary" @click="decreaseQty(item)">
                        <i class="bi bi-dash"></i>
                      </button>
                      <input type="text" class="form-control text-center fw-semibold border-start-0 border-end-0"
                            :value="item.quantity" readonly max="10">
                      <button class="btn btn-outline-secondary" @click="increaseQty(item)">
                        <i class="bi bi-plus"></i>
                      </button>
                    </div>
                  </div>
                  <button class="btn btn-link text-danger p-0" @click="removeFromCart(item.id)">
                    <i class="bi bi-trash fs-5"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Checkout Summary -->
          <div v-if="cart.length > 0" class="bg-white rounded shadow-sm mt-4 p-4">
            <div class="row justify-content-end">
              <div class="col-12 col-md-6 col-lg-4">
                <div v-if="!hasSelectedItems" class="text-center text-muted mb-3">
                  <i class="bi bi-info-circle me-2"></i>Please select items to proceed to checkout
                </div>
                <div v-else>
                  <div class="d-flex justify-content-between mb-2">
                    <span>Selected items ({{ selectedCount }}):</span>
                    <span class="fw-semibold">RM{{ totalPrice.toFixed(2) }}</span>
                  </div>
                  <div class="d-flex justify-content-between mb-2">
                    <span>Delivery Fee (10%):</span>
                    <span class="fw-semibold">RM{{ deliveryFee.toFixed(2) }}</span>
                  </div>
                  <hr class="my-2">
                  <div class="d-flex justify-content-between mb-3">
                    <span class="fw-bold fs-5">Total:</span>
                    <span class="fw-bold fs-5 text-primary">RM{{ totalWithDelivery.toFixed(2) }}</span>
                  </div>
                </div>

                <button class="btn w-100 text-white fw-semibold py-2 py-md-3"
                        :disabled="!hasSelectedItems"
                        :class="{ 'opacity-50': !hasSelectedItems }"
                        @click="purchaseCart"
                        style="background: linear-gradient(135deg, #0d6efd, #4facfe); border-radius: 25px;">
                  <i class="bi bi-credit-card me-2"></i>
                  <span v-if="hasSelectedItems">
                    Checkout {{ selectedCount }} Item{{ selectedCount > 1 ? 's' : '' }} →
                  </span>
                  <span v-else>
                    Select Items to Checkout
                  </span>
                </button>
              </div>
            </div>
          </div>

        </template>
      </div>
    </div>
  </div>`,
};
