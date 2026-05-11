const Purchase = {
  inject: ["authState"],

  data() {
    return {
      orders: [],
      editingOrderId: null,
    };
  },

  mounted() {
    this.fetchPurchases();
  },

  computed: {
    totalItems() {
      return this.orders.reduce((sum, order) => sum + (order.items?.length || 0), 0);
    },
    orderTotal() {
      return (order) => {
        const subtotal = order.items.reduce(
          (sum, item) => sum + parseFloat(item.price) * item.quantity,
          0
        );
        const deliveryFee = subtotal > 0 ? subtotal * 0.1 : 0;
        return {
          subtotal,
          deliveryFee,
          total: subtotal + deliveryFee,
        };
      };
    },
  },

  methods: {
    fetchPurchases() {
      if (this.authState.isLoggedIn && this.authState.user?.id) {
        fetch(`resources/api_orders.php?user_id=${this.authState.user.id}`)
          .then((res) => res.json())
          .then((data) => {
            this.orders = Array.isArray(data?.data)
              ? data.data
              : (Array.isArray(data) ? data : []);
          });
      } else {
        this.orders = [];
      }
    },

    startEditOrder(orderId) {
      this.editingOrderId = orderId;
    },

    cancelEditOrder() {
      this.editingOrderId = null;
    },

    saveEditOrder() {
      this.editingOrderId = null;
      this.fetchPurchases();
    },

    updatePurchaseQuantity(item) {
      fetch(`resources/api_order_items.php?id=${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: item.quantity }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            alert("Failed to update quantity.");
          } else {
            this.fetchPurchases();
          }
        })
        .catch(() => alert("An error occurred while updating quantity."));
    },

    increaseQty(item) {
      if (item.quantity < 10) {
        item.quantity++;
        this.updatePurchaseQuantity(item);
      }
    },

    decreaseQty(item) {
      if (item.quantity > 1) {
        item.quantity--;
        this.updatePurchaseQuantity(item);
      }
    },

    removeFromPurchase(itemId, orderId) {
      fetch(`resources/api_order_items.php?id=${itemId}&order_id=${orderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) {
            this.fetchPurchases();
          } else {
            alert("Failed to delete order item.");
          }
        })
        .catch(() => alert("An error occurred while deleting."));
    },
  },

  template: `
  <div class="container-fluid" style="background-color: #f8f9fa; min-height: 100vh;">
  <div class="container d-flex flex-column" >
    <h2 class="my-4 text-center fw-bold">
      Purchase History
      <span v-if="totalItems > 0" class="badge text-white ms-2"
            style="background: linear-gradient(135deg, #0d6efd, #4facfe);">
          {{ orders.length }}
      </span>
    </h2>

    <!-- Show error if not logged in -->
    <div v-if="!authState.isLoggedIn" class="alert alert-danger text-center my-5">
      You must be logged in to view your purchase history.
    </div>

    <template v-if="authState.isLoggedIn">
      <div v-if="orders.length === 0" class="bg-white rounded shadow-sm p-5 text-center my-5">
        <i class="bi bi-bag-x display-1 text-muted mb-3"></i>
        <p class="fs-4 text-muted mb-0">You have no purchases yet</p>
        <p class="text-muted">Buy something to see it here!</p>
      </div>

      <!-- Desktop/Tablet Card Table View -->
      <div v-else class="d-none d-sm-block">
        <div v-for="order in orders" :key="order.id" class="card shadow mb-4 border-0 rounded-4">
          <div class="card-header text-white d-flex justify-content-between align-items-center rounded-top-4" style="background: linear-gradient(135deg, #0d6efd, #4facfe);">
            <div>
              <strong>Order #{{ order.id }}</strong>
              <span class="ms-3 text-light small d-none d-lg-inline">Date: {{ order.purchase_date }}</span>
            </div>
            <div>
              <span class="fw-semibold">
                Total: RM{{ orderTotal(order).total.toFixed(2) }}
                <span class="text-white-50 small">(Subtotal: RM{{ orderTotal(order).subtotal.toFixed(2) }}, Delivery: RM{{ orderTotal(order).deliveryFee.toFixed(2) }})</span>
              </span>
              <button v-if="editingOrderId !== order.id" class="btn btn-sm btn-light ms-3"
                      @click="startEditOrder(order.id)">
                <i class="bi bi-pencil"></i> Edit
              </button>
              <span v-else>
                <button class="btn btn-sm btn-success ms-2" @click="saveEditOrder">
                  <i class="bi bi-check"></i> Save
                </button>
                <button class="btn btn-sm btn-secondary ms-1" @click="cancelEditOrder">
                  <i class="bi bi-x"></i> Cancel
                </button>
              </span>
            </div>
          </div>
          <div class="card-body p-0">
            <table class="table table-bordered table-hover mb-0" style="table-layout: fixed;">
              <thead class="table-light text-center">
                <tr>
                  <th style="width: 80px;">Cover</th>
                  <th style="width: 220px;">Title & Vol.</th>
                  <th style="width: 140px;">Quantity</th>
                  <th style="width: 120px;">Price</th>
                  <th style="width: 100px;">Action</th>
                </tr>
              </thead>
              <tbody class="text-center align-middle">
                <tr v-for="item in order.items" :key="item.id">
                  <td>
                    <img :src="item.cover" alt="cover" class="rounded shadow-sm" style="width: 60px; height: auto;" />
                  </td>
                  <td class="text-start text-wrap text-break">
                    <span class="fw-semibold d-block w-100">{{ item.book_title }} Vol. {{ item.volume }}</span>
                  </td>
                  <td>
                    <div v-if="editingOrderId === order.id" class="input-group input-group-sm mx-auto" style="max-width: 120px;">
                      <button class="btn btn-outline-secondary" type="button" @click="decreaseQty(item)">
                        <i class="bi bi-dash"></i>
                      </button>
                      <input type="text" class="form-control text-center fw-semibold border-start-0 border-end-0"
                            v-model.number="item.quantity">
                      <button class="btn btn-outline-secondary" type="button" @click="increaseQty(item)">
                        <i class="bi bi-plus"></i>
                      </button>
                    </div>
                    <div v-else>
                      {{ item.quantity }}
                    </div>
                  </td>
                  <td class="fw-bold">RM{{ (item.price * item.quantity).toFixed(2) }}</td>
                  <td>
                    <button v-if="editingOrderId === order.id"
                            class="btn btn-link text-danger p-0 small text-decoration-none"
                            @click="removeFromPurchase(item.id, order.id)">
                      <i class="bi bi-trash me-1"></i>Remove
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Mobile Card View -->
      <div class="d-md-none">
        <div v-for="order in orders" :key="order.id" class="card shadow mb-4 border-0 rounded-4">
          <div class="card-header bg-primary bg-gradient text-white rounded-top-4">
            <div class="d-flex justify-content-between align-items-center flex-nowrap gap-3">
              <div>
                <strong>Order #{{ order.id }}</strong>
              </div>

              <div class="d-flex align-items-center gap-2 flex-nowrap">
                <span class="fw-semibold">
                  Total: RM{{ orderTotal(order).total.toFixed(2) }}
                </span>
                <button v-if="editingOrderId !== order.id" class="btn btn-sm btn-light ms-2"
                        @click="startEditOrder(order.id)">
                  <i class="bi bi-pencil"></i>
                </button>
                <span v-else>
                  <button class="btn btn-sm btn-success me-4" @click="saveEditOrder">
                    <i class="bi bi-check"></i>
                  </button>
                  <button class="btn btn-sm btn-secondary mt-1" @click="cancelEditOrder">
                    <i class="bi bi-x"></i>
                  </button>
                </span>
              </div>
            </div>
          </div>
          <div class="card-body p-2">
            <div v-for="item in order.items" :key="item.id" class="row align-items-center border-bottom py-2">
              <div class="col-3">
                <img :src="item.cover" alt="cover" class="rounded shadow-sm w-100" style="max-width: 60px; height: auto;" />
              </div>
              <div class="col-9">
                <div class="fw-semibold">{{ item.book_title }} Vol. {{ item.volume }}</div>
                <!-- Removed: <div class="small text-muted">Date: {{ order.purchase_date }}</div> -->
                <div class="d-flex align-items-center mt-1">
                  <span class="me-2">Qty:</span>
                  <div v-if="editingOrderId === order.id" class="input-group input-group-sm" style="max-width: 100px;">
                    <button class="btn btn-outline-secondary" type="button" @click="decreaseQty(item)">
                      <i class="bi bi-dash"></i>
                    </button>
                    <input type="text" class="form-control text-center fw-semibold border-start-0 border-end-0"
                          v-model.number="item.quantity">
                    <button class="btn btn-outline-secondary" type="button" @click="increaseQty(item)">
                      <i class="bi bi-plus"></i>
                    </button>
                  </div>
                  <div v-else>
                    {{ item.quantity }}
                  </div>
                </div>
                <div class="fw-bold mt-1">RM{{ (item.price * item.quantity).toFixed(2) }}</div>
                <button v-if="editingOrderId === order.id"
                        class="btn btn-link text-danger p-0 small text-decoration-none mt-1"
                        @click="removeFromPurchase(item.id, order.id)">
                  <i class="bi bi-trash me-1"></i>Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
  </div>
`,
};
