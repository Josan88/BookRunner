const Reset = {
  inject: ["authState"],

  data: () => ({
    msg: "",
    submitted: false,
    password: "",
    confirmPassword: "",
    showPassword: false,
    passwordRules: [
      (v) => !!v || "Password is required",
      (v) => v?.length >= 8 || "Password must be at least 8 characters",
    ],
    confirmPasswordRules: [
      (v) => !!v || "Confirm password is required",
      // Matching rule added in watcher
    ],
  }),

  methods: {
    submitNewPassword() {
      this.msg = "";
      if (!this.password || !this.confirmPassword) {
        this.msg = "Please fill in all password fields.";
        return;
      }

      if (this.password !== this.confirmPassword) {
        this.msg = "Passwords do not match.";
        return;
      }

      const userId = this.authState.user?.id;
      const token = this.authState.user?.token;

      fetch(`resources/api_user.php/id/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: this.password }),
      })
        .then((res) => res.json())
        .then((data) => {
          this.submitted = true;
          this.msg = data?.success
            ? "Your password has been reset successfully."
            : data?.error || "An error occurred while resetting your password.";

          if (data?.success) {
            this.authState.isLoggedIn = false;
            this.authState.user = null;
          }
        })
        .catch(() => {
          this.msg = "An error occurred while resetting your password.";
        });
    },

    togglePasswordVisibility() {
      this.showPassword = !this.showPassword;
    },
  },

  watch: {
    confirmPassword(newValue) {
      this.confirmPasswordRules[1] =
        newValue !== this.password ? () => "Passwords do not match" : true;
    },
  },

  template: `
    <div class="bookrunner-bg">
      <v-form ref="form" class="d-flex align-items-center">
        <div class="border border-dark border-4 rounded-3 shadow-sm mx-6 bg-white" style="width: 100%; max-width: 1000px; max-height: 600px;">
          <div class="row g-0 align-items-stretch h-100">
            <!-- Form Side -->

            <div class="col-12 col-lg-6 p-3 p-sm-4 d-flex flex-column justify-content-center" style="height: 100%;">
              <img src="images/logo_login.png" alt="Logo" class="img-fluid mb-4 d-block">
              <h2 class="text-center mt-2">Password Reset</h2>
              <br/>
              <template v-if="!authState.isLoggedIn">
                <div class="alert alert-warning text-center">
                  Please <router-link to="/login" class="alert-link">log in</router-link> to reset your password.
                </div>
              </template>
              <template v-else-if="!submitted">
                <div class="mb-2">
                  <v-text-field
                    name="password"
                    v-model="password"
                    :rules="passwordRules"
                    color="#0d6efd"
                    label="New Password"
                    variant="outlined"
                    prepend-inner-icon="mdi-lock-outline"
                    :type="showPassword ? 'text' : 'password'"
                    :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                    @click:append-inner="togglePasswordVisibility"
                    class="login_field rounded-3"
                    required
                  />
                </div>
                <div class="mb-2">
                  <v-text-field
                    name="confirmPassword"
                    v-model="confirmPassword"
                    :rules="confirmPasswordRules"
                    color="#0d6efd"
                    label="Confirm New Password"
                    variant="outlined"
                    prepend-inner-icon="mdi-lock-check-outline"
                    :type="showPassword ? 'text' : 'password'"
                    :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                    @click:append-inner="togglePasswordVisibility"
                    class="login_field rounded-3"
                    required
                  />
                </div>
                <div class="mb-3 text-center text-danger">
                  <p v-if="msg">{{ msg }}</p>
                </div>
                <div class="mb-3">
                  <v-btn class="btn btn-theme-primary rounded-3" block size="large" variant="flat" @click="submitNewPassword">
                    Reset Password
                  </v-btn>
                </div>
              </template>
              <template v-else>
                <div class="alert alert-success text-center">
                  {{ msg }}
                </div>
                <div class="text-center mt-4">
                  <router-link to="/login" class="text-primary">Back to Login</router-link>
                </div>
              </template>
            </div>
            <!-- Right Image Column -->
            <div class="col-lg-6 d-none d-md-flex align-items-center justify-content-center rounded-end-3">
              <img src="images/login_bg.png" alt="Logo"
                  style="max-height: 600px; width: 100%; object-fit: cover; border-top-right-radius: 0.5rem; border-bottom-right-radius: 0.5rem;">
            </div>
          </div>
        </div>
      </v-form>
    </div>
  `,
};
