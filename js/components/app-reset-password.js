const Reset = {
  inject: ["authState"],

  data: () => ({
    email: "",
    msg: "",
    submitted: false,
    step: 1, // 1: email input, 2: password reset
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
    logout() {
      if (this.authState) {
        this.authState.isLoggedIn = false;
        this.authState.user = null;
      }
    },

    submitEmail() {
      this.msg = "";
      if (!this.email) {
        this.msg = "Please enter your email address.";
        return;
      }

      fetch("resources/api_user.php?getAllEmails=true")
        .then((res) => res.json())
        .then((emails) => {
          if (Array.isArray(emails) && emails.includes(this.email)) {
            this.step = 2;
            this.msg = "";
          } else {
            this.msg = "This email is not registered in our system.";
          }
        })
        .catch(() => {
          this.msg = "An error occurred. Please try again later.";
        });
    },

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

      // Get user ID based on email, then update password
      fetch(`resources/api_user.php?email=${encodeURIComponent(this.email)}`)
        .then((res) => res.json())
        .then((user) => {
          if (!user?.id) {
            this.msg = "User not found.";
            return;
          }

          fetch(`resources/api_user.php/id/${user.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: this.password }),
          })
            .then((res) => res.json())
            .then((data) => {
              this.submitted = true;
              this.msg = data?.success
                ? "Your password has been reset successfully. You can now log in with your new password."
                : data?.error || "An error occurred while resetting your password.";
            })
            .catch(() => {
              this.msg = "An error occurred while resetting your password.";
            });
        })
        .catch(() => {
          this.msg = "An error occurred. Please try again later.";
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
              <template v-if="step === 1 && !submitted">
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
                  ></v-text-field>
                </div>
                <div class="mb-3 text-center text-danger">
                  <p v-if="msg">{{ msg }}</p>
                </div>
                <div class="mb-3">
                  <v-btn class="btn btn-theme-primary rounded-3" block size="large" variant="flat" @click="submitEmail">
                    Next <v-icon icon="mdi-arrow-right" class="ms-2"> </v-icon>
                  </v-btn>
                </div>
              </template>
              <template v-else-if="step === 2 && !submitted">
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
                  <v-btn class="btn btn-theme-primary rounded-3" block size="large" variant="flat" @click="submitNewPassword(); logout();">
                    Reset Password
                  </v-btn>
                </div>
              </template>
              <template v-else>
                <div class="alert alert-success text-center">
                  {{ msg }}
                </div>
                <div class="text-center mt-4">
                  <router-link to="/" class="text-primary">Back to Home Page</router-link>
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