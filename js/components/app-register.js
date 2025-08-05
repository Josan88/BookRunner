const Register = {
  template: `
    <div class="bookrunner-bg">
      <v-form ref="form" class="d-flex align-items-center my-5">
        <div class="my-6 my-lg-1 border border-dark border-4 rounded-3 bg-white shadow-sm mx-6 mx-lg-1" style="width: 100%; max-height: 1000px;">
          <div class="row g-0 align-items-stretch h-100">

            <!-- Left Image Column -->
            <div class="col-lg-6 d-none d-md-flex align-items-center justify-content-center rounded-end-3" style="background: #90d5ff;">
              <img src="images/logo_register.png" alt="Logo" class="img-fluid" style="object-fit: cover; border-top-right-radius: 0.5rem; border-bottom-right-radius: 0.5rem;">
            </div>

            <!-- Form Side -->
            <div class="col-12 col-lg-6 p-3 p-sm-4 d-flex flex-column justify-content-center" style="height: 100%;">
              <h2 class="text-center">Create Account</h2>
              <br />

              <v-text-field v-model="username" :rules="usernameRules" label="Username" color="#0d6efd" variant="outlined" prepend-inner-icon="mdi-account-outline" class="login_field rounded-3 mb-2" required />
              <v-text-field v-model="email" :rules="emailRules" label="Email" color="#0d6efd" variant="outlined" prepend-inner-icon="mdi-email-outline" class="login_field rounded-3 mb-2" required />
              <v-text-field v-model="password" :rules="passwordRules" :type="showPassword ? 'text' : 'password'" :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'" @click:append-inner="togglePasswordVisibility" label="Password" color="#0d6efd" variant="outlined" prepend-inner-icon="mdi-lock-outline" class="login_field rounded-3 mb-2" required />
              <v-text-field v-model="confirmPassword" :rules="confirmPasswordRules" :type="showPassword ? 'text' : 'password'" :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'" @click:append-inner="togglePasswordVisibility" label="Confirm Password" color="#0d6efd" variant="outlined" prepend-inner-icon="mdi-lock-check-outline" class="login_field rounded-3 mb-2" required />
              <v-text-field v-model="age" :rules="ageRules" type="number" min="12" max="100" label="Age" color="#0d6efd" variant="outlined" prepend-inner-icon="mdi-cake-variant-outline" class="login_field rounded-3 mb-2" required />
              <v-select v-model="gender" :items="['Male', 'Female', 'Other']" :rules="genderRules" label="Gender" color="#0d6efd" prepend-inner-icon="mdi-gender-male-female" variant="outlined" class="login_field rounded-3 mb-2" required />
              <v-checkbox v-model="agreed" :rules="agreeRules" label="I agree to the Terms and Conditions of Book Runner" class="mb-5 mx-0" color="#0d6efd" />

              <div class="mb-3 text-center text-danger">
                <p v-if="msg">{{ msg }}</p>
              </div>

              <v-btn class="btn btn-theme-primary rounded-3" block size="large" variant="flat" @click="submitForm">
                Sign Up
              </v-btn>

              <div class="text-center mt-3">
                <span>Already have an account? </span>
                <router-link to="/login" class="text-primary">Log in</router-link>
              </div>
            </div>
          </div>
        </div>
      </v-form>
    </div>
  `,

  data: () => ({
    msg: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    gender: null,
    age: "",
    showPassword: false,
    agreed: false,

    usernameRules: [
      v => !!v || "Username is required",
      v => v.length >= 3 || "Username must have at least 3 characters"
    ],
    emailRules: [
      v => !!v || "Email is required",
      v => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,3}$/.test(v) || "Email must be valid"
    ],
    passwordRules: [
      v => !!v || "Password is required",
      v => v.length >= 8 || "Password must be at least 8 characters"
    ],
    confirmPasswordRules: [
      v => !!v || "Confirm password is required",
      v => true // default, updated in watcher
    ],
    ageRules: [
      v => !!v || "Age is required",
      v => v >= 12 || "You must be at least 12 years old"
    ],
    genderRules: [
      v => !!v || "Gender is required"
    ],
    agreeRules: [
      v => !!v || "You must agree to the terms and conditions"
    ]
  }),

  methods: {
    togglePasswordVisibility() {
      this.showPassword = !this.showPassword;
    },

    async submitForm() {
      this.msg = "";
      const { valid } = await this.$refs.form.validate();

      if (!valid) {
        this.msg = "Please fix the errors above before submitting.";
        return;
      }

      const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username,
          email: this.email,
          password: this.password,
          age: this.age,
          gender: this.gender,
        }),
      };

      fetch("resources/api_user.php", requestOptions)
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            this.msg = data.error;
          } else if (data.success) {
            this.$router.push("/login");
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          this.msg = "An error occurred during registration.";
        });
    },
  },

  watch: {
    confirmPassword(newVal) {
      this.confirmPasswordRules[1] =
        () => newVal === this.password || "Passwords do not match";
    },
    password(newVal) {
      // Optional: update confirm rule as user changes password too
      if (this.confirmPassword) {
        this.confirmPasswordRules[1] =
          () => this.confirmPassword === newVal || "Passwords do not match";
      }
    }
  }
};
