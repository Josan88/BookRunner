// Initialize from sessionStorage
const savedAuth = JSON.parse(sessionStorage.getItem("authState"));

const authState = Vue.reactive({
  isLoggedIn: savedAuth?.isLoggedIn || false,
  user: savedAuth?.user || null,
});

// Sync changes to sessionStorage
Vue.watch(
  () => authState,
  (newVal) => {
    sessionStorage.setItem("authState", JSON.stringify(newVal));
  },
  { deep: true }
);

const routes = [
  { path: "/", component: Home },
  { path: "/login", component: Login, name: "login" },
  { path: "/register", component: Register },
  { path: "/product", component: Product },
  { path: "/book/:title/:volume", component: Book, props: true },
  { path: "/cart", component: Cart },
  { path: "/profile", component: Profile },
  { path: "/purchase", component: Purchase },
  { path: "/reset-pw", component: Reset },
];

const router = VueRouter.createRouter({
  history: VueRouter.createWebHashHistory(),
  routes,
});

const { createVuetify } = Vuetify;
const vuetify = createVuetify();
const app = Vue.createApp({
  components: {
    Header,
    Footer,
  },

  setup() {
    const route = VueRouter.useRoute();
    return { route };
  },

  template: `
        <div id="app" class="d-flex flex-column min-vh-100">
            <Header/>
            <router-view class="flex-grow-1" ></router-view>
            <Footer/>
        </div>
    `,
});

app.provide("authState", authState);
app.use(router).use(vuetify).mount("#app");
