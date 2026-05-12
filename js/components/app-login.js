const Login = {
  data: () => ({
    email: "",
    password: "",
    msg: "",
    showPassword: false,
  }),

  setup() {
    const authState = Vue.inject("authState");
    return { authState };
  },

  methods: {
    login() {
      const apiBaseUrl = (window.__APP_CONFIG__?.API_BASE_URL || "").replace(/\/$/, "");
      const postSQLApiURL = apiBaseUrl
        ? `${apiBaseUrl}/resources/api_user.php`
        : "resources/api_user.php";

      if (this.$refs.form.validate()) {
        fetch(postSQLApiURL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: this.email,
            password: this.password,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (!data || data.error) {
              this.msg = data?.error || "Email or password incorrect.";
            } else {
              this.authState.isLoggedIn = true;
              this.authState.user = data;
              this.$router.push("/product");
            }
          })
          .catch((err) => {
            console.error("Error:", err);
            alert("An error occurred.");
          });
      }
    },

    togglePasswordVisibility() {
      this.showPassword = !this.showPassword;
    },
  },

  template: `
    <div class="bookrunner-bg">
      <v-form ref="form" class="d-flex align-items-center">
        <div class="border border-dark border-4 rounded-3 shadow-sm mx-6 bg-white" style="width: 100%; max-height: 675px;">
          <div class="row g-0 align-items-stretch h-100">

            <!-- Left: Login Form -->
            <div class="col-12 col-lg-6 p-3 p-sm-4 d-flex flex-column justify-content-center">
              <img src="images/logo_login.png" alt="Logo" class="img-fluid mb-4 d-block" />
              <h2 class="text-center mt-2">Welcome</h2>
              <br />

              <!-- Email Input -->
              <div class="mb-2">
                <v-text-field
                  name="email"
                  v-model="email"
                  color="#0d6efd"
                  label="Email"
                  variant="outlined"
                  prepend-inner-icon="mdi-email-outline"
                  class="login_field rounded-3"
                  required
                />
              </div>

              <!-- Password Input -->
              <div class="mb-2">
                <v-text-field
                  name="password"
                  v-model="password"
                  color="#0d6efd"
                  label="Password"
                  variant="outlined"
                  prepend-inner-icon="mdi-lock-outline"
                  :type="showPassword ? 'text' : 'password'"
                  :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                  @click:append-inner="togglePasswordVisibility"
                  class="login_field rounded-3"
                  required
                />
                <div class="text-end mt-0">
                  <small class="text-muted">To change your password, visit your profile after logging in.</small>
                </div>
              </div>

              <!-- Error Message -->
              <div class="mb-3 text-center text-danger">
                <p v-if="msg">{{ msg }}</p>
              </div>

              <!-- Login Button -->
              <div class="mb-2">
                <v-btn
                  class="btn btn-theme-primary rounded-3"
                  block
                  size="large"
                  variant="flat"
                  @click="login"
                >
                  <v-icon icon="mdi-login" class="mr-2" />
                  Login
                </v-btn>
              </div>

              <!-- Register Link -->
              <div class="text-center mt-2">
                <span>Don't have an account? </span>
                <router-link to="/register" class="text-primary">Register</router-link>
              </div>
            </div>

            <!-- Right: Background Image -->
            <div class="col-lg-6 d-none d-md-flex align-items-center justify-content-center rounded-end-3">
              <img
                src="images/login_bg.png"
                alt="Login Background"
                style="max-height: 650px; width: 100%; object-fit: cover; border-top-right-radius: 0.5rem; border-bottom-right-radius: 0.5rem;"
              />
            </div>

          </div>
        </div>
      </v-form>
    </div>
  `,
};
