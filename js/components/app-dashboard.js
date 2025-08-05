const Header = {
  setup() {
    const authState = Vue.inject("authState");
    return { authState };
  },

  computed: {
    navLinks() {
      return [
        { to: "/", icon: "house", text: "Home" },
        { to: "/product", icon: "book", text: "Books" },
        { to: "/cart", icon: "cart", text: "Cart" },
        { to: "/purchase", icon: "bag-check", text: "Purchase" },
      ];
    },
  },

  template: `
    <nav class="navbar navbar-light px-3" style="z-index: 1000;">
      <div class="container-fluid d-flex justify-content-between align-items-center">

        <!-- Logo -->
        <router-link to="/" class="navbar-brand d-flex align-items-center me-4">
          <img src="images/logo.png" alt="Logo" class="d-none d-sm-block" style="height: 60px;">
          <img src="images/logo_small.png" alt="Logo" class="d-block d-sm-none" style="height: 60px;">
        </router-link>

        <!-- Desktop Navigation -->
        <div class="d-none d-md-flex align-items-center gap-3 flex-grow-1">
          <router-link
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="nav-link fs-6 fw-semibold px-2"
          >
            <i :class="'bi bi-' + link.icon"></i> {{ link.text }}
          </router-link>
        </div>

        <!-- Mobile Dropdown -->
        <div class="dropdown d-lg-none ms-2">
          <button class="btn btn-outline-secondary dropdown-toggle" type="button" id="mobileDropdown" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="bi bi-list"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="mobileDropdown">
            <li v-for="link in navLinks" :key="link.to">
              <router-link class="dropdown-item" :to="link.to">
                <i :class="'bi bi-' + link.icon + ' me-1'"></i>{{ link.text }}
              </router-link>
            </li>
            <template v-if="!authState.isLoggedIn">
              <li><router-link class="dropdown-item" to="/login"><i class="bi bi-box-arrow-in-right me-1"></i>Login</router-link></li>
              <li><router-link class="dropdown-item" to="/register"><i class="bi bi-person-plus-fill me-1"></i>Register</router-link></li>
            </template>
            <template v-else>
              <li><router-link class="dropdown-item" to="/profile"><i class="bi bi-person-circle me-1"></i>Account</router-link></li>
            </template>
          </ul>
        </div>

        <!-- Desktop Buttons -->
        <div class="d-none d-md-flex align-items-center gap-2">
          <template v-if="!authState.isLoggedIn">
            <router-link to="/login" class="text-decoration-none">
              <div class="btn btn-outline-dark d-flex align-items-center px-3 py-2 rounded-pill">
                <i class="bi bi-box-arrow-in-right me-2"></i>
                <span class="fw-semibold">Login</span>
              </div>
            </router-link>
            <router-link to="/register" class="text-decoration-none">
              <div class="btn btn-theme-primary d-flex align-items-center px-3 py-2 rounded-pill">
                <i class="bi bi-person-plus-fill me-2"></i>
                <span class="fw-semibold">Register</span>
              </div>
            </router-link>
          </template>
          <template v-else>
            <router-link to="/profile" class="text-decoration-none">
              <div class="btn btn-theme-primary d-flex align-items-center px-3 py-2 rounded-pill">
                <i class="bi bi-person-circle me-2"></i>
                <span class="fw-semibold">Account</span>
              </div>
            </router-link>
          </template>
        </div>
        
      </div>
    </nav>
  `,
};
