const Profile = {
  inject: ["authState"],
  data() {
    return {
      name: "",
      email: "",
      editMode: false,
      recentPurchases: [],
    };
  },

  mounted() {
    this.fetchProfile();
    this.fetchRecentPurchases();
  },

  methods: {
    fetchProfile() {
      const userId = this.authState.user?.id;
      const token = this.authState.user?.token;
      if (this.authState.isLoggedIn && userId && token) {
        fetch(`resources/api_user.php/id/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(res => res.json())
          .then(data => {
            if (data && !data.error) {
              this.name = data.name || "";
              this.email = data.email || "";
            }
          });
      }
    },

    fetchRecentPurchases() {
      const userId = this.authState.user?.id;
      if (this.authState.isLoggedIn && userId) {
        fetch(`resources/api_orders.php?user_id=${userId}`)
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) {
              this.recentPurchases = data
                .sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date))
                .slice(0, 3);
            } else {
              this.recentPurchases = [];
            }
          });
      }
    },

    saveProfile() {
      const userId = this.authState.user?.id;
      const token = this.authState.user?.token;
      if (this.authState.isLoggedIn && userId && token) {
        fetch(`resources/api_user.php/id/${userId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: this.name,
            email: this.email,
          }),
        })
          .then(res => res.json())
          .then(data => {
            if (!data?.error) {
              this.editMode = false;
              this.fetchProfile();
            } else {
              alert("Failed to update profile.");
            }
          })
          .catch(() => alert("An error occurred while updating profile."));
      }
    },

    cancelEdit() {
      this.fetchProfile();
      this.editMode = false;
    },

    logout() {
      if (this.authState) {
        this.authState.isLoggedIn = false;
        this.authState.user = null;
        sessionStorage.removeItem("user");
        this.$router.push("/");
      }
    },
  },

  template: `
    <div class="container-fluid px-2 px-md-4 py-4" style="background-color: #f8f9fa; min-height: 100vh;"> 
      <div class="container py-5">
        <h2 class="text-center mb-4 fw-bold">My Profile</h2>
        <div class="row justify-content-center">
          <div class="col-12 col-md-8 col-lg-10">
            <div class="row g-4">

              <!-- Profile Section -->
              <div class="col-12 col-lg-7">
                <div class="bg-white rounded-3 shadow-sm p-4 h-100">
                  <div class="d-flex justify-content-between align-items-center mb-4">
                    <h4 class="fw-semibold fs-5">
                      <i class="bi bi-person-fill me-1"></i> Personal Information
                    </h4>
                    <div>
                      <button v-if="editMode" type="button" class="btn btn-outline-secondary btn-sm me-2" @click="cancelEdit">
                        <i class="bi bi-x me-1"></i><span class="d-none d-sm-inline">Cancel</span>
                      </button>
                      <button type="button" class="btn btn-primary btn-sm" @click="editMode ? saveProfile() : editMode = true">
                        <i :class="editMode ? 'bi bi-save' : 'bi bi-pencil'" class="me-1"></i>
                        {{ editMode ? 'Save' : 'Edit' }}
                      </button>
                    </div>
                  </div>

                  <form @submit.prevent>
                    <div class="mb-3">
                      <label class="form-label fw-semibold">Username</label>
                      <input type="text" class="form-control" v-model="name" :readonly="!editMode" :class="editMode ? 'bg-light border-primary' : ''">
                    </div>
                    <div class="mb-3">
                      <label class="form-label fw-semibold">Email</label>
                      <input type="email" class="form-control" v-model="email" readonly>
                    </div>

                    <div class="row mb-4 mt-5">
                      <div class="col-12 mb-2">
                        <router-link to="/reset-pw">
                          <button type="button" class="btn btn-warning w-100 text-dark py-2" :disabled="editMode">
                            <i class="bi bi-key me-1"></i>Reset Password
                          </button>
                        </router-link>
                      </div>
                      <div class="col-12">
                        <button type="button" class="btn btn-danger w-100 text-white py-2" @click="logout" :disabled="editMode">
                          <i class="bi bi-box-arrow-right me-1"></i>Log Out
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>

              <!-- Recent Purchases -->
              <div class="col-12 col-lg-5">
                <div class="bg-white rounded-4 shadow-sm p-4 h-100">
                  <h4 class="fw-semibold fs-5 mb-4 d-flex align-items-center">
                    <i class="bi bi-bag-check-fill me-2"></i> Recent Purchases
                  </h4>
                  <div v-if="recentPurchases.length > 0">
                    <div class="d-flex flex-column gap-3">
                      <div v-for="order in recentPurchases" :key="order.id" class="border rounded-3 p-3 bg-light shadow-sm">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                          <div>
                            <span class="fw-bold">Order #{{ order.id }}</span>
                            <span class="text-muted small ms-2">{{ order.purchase_date }}</span>
                          </div>
                          <div class="fw-semibold">
                            RM{{
                              order.items
                                ? (order.items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0) * 1.1).toFixed(2)
                                : '0.00'
                            }}
                          </div>
                        </div>
                        <div v-for="item in order.items" :key="item.id" class="text-dark py-2">
                          <span class="fw-semibold">{{ item.book_title }}</span>
                          <span class="text-muted small ms-1">Vol. {{ item.volume }}</span>
                          <span class="ms-2">x{{ item.quantity }}</span>
                        </div>
                      </div>
                    </div>
                    <router-link to="/purchase">
                      <button class="btn btn-outline-primary w-100 mt-4">
                        View More <i class="bi bi-arrow-right ms-1"></i>
                      </button>
                    </router-link>
                  </div>
                  <div v-else class="text-muted small text-center py-4">No purchases yet.</div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  `,
};
