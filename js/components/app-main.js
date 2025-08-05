const Home = {
  template: `
    <div class="container-fluid">

      <!-- Hero Section -->
      <div class="row d-flex justify-content-center align-items-center flex-column text-center landing_page">
        <div class="row text-container">
          <div class="col-12">
            <h1 class="display-4 fw-bold">Your next obsession starts here.</h1>
            <p class="fs-5">Discover the latest manga and light novel series that will keep you on the edge of your seat.</p>
            <router-link to="/product" class="text-decoration-none">
              <div class="fs-5 btn btn-theme-primary fw-semibold rounded-pill px-4 py-3 mt-3">Explore Now</div>
            </router-link>   
          </div>
        </div>

        <!-- Stats Section -->
        <div class="row g-4 justify-content-center mb-5">
          <div class="col-6 col-md-4 col-lg-2" v-for="stat in stats" :key="stat.label">
            <div class="text-dark p-3 text-center">
              <h2 class="fw-bold mb-0">{{ stat.value }}</h2>
              <p class="mb-0 text-muted small">{{ stat.label }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Explore Section -->
      <h1 class="text-center mt-5 py-6 fw-bold">Explore Different Genres</h1>
      <div class="container d-flex align-items-center justify-content-center">
        <button class="btn btn-lg text-primary bg-transparent border-0 me-2 genre-arrow"
                @click="goToPage(currentPage - 1)"
                :disabled="currentPage === 1">
          <i class="bi bi-chevron-left display-4"></i>
        </button>

        <div class="row row-cols-2 row-cols-md-3 g-4 flex-grow-1" style="min-width: 0;">
          <div class="col" v-for="genre in visibleGenres" :key="genre">
            <router-link :to="{ path: '/product', query: { genre } }" class="text-decoration-none">
              <div class="card genre-card h-100 text-center shadow-sm border border-dark btn-theme-primary">
                <div class="fs-6 card-body d-flex align-items-center justify-content-center fw-semibold">
                  {{ genre }}
                </div>
              </div>
            </router-link>
          </div>
        </div>

        <button class="btn btn-lg text-primary bg-transparent border-0 ms-2 genre-arrow"
                @click="goToPage(currentPage + 1)"
                :disabled="currentPage === totalPages">
          <i class="bi bi-chevron-right display-4"></i>
        </button>
      </div>

      <div class="d-flex justify-content-center mt-3 explore-dots">
        <span v-for="n in totalPages" :key="n" class="mx-1" :class="{ 'text-primary': n === currentPage }">
          <i class="bi" :class="n === currentPage ? 'bi-dot' : 'bi-dot text-secondary'"></i>
        </span>
      </div>

      <!-- Manga of the Month -->
      <div class="mt-5" style="background-color: #e3f2fd; border-top: 4px solid gold; border-bottom: 4px solid gold;">
        <div class="mx-6 mb-5">
          <h1 class="text-center fw-bold mb-5">Manga of the Month</h1>
          <div class="row g-4 justify-content-center text-center">
            <div class="col-6 col-md-4 col-lg-2" v-for="(book, index) in books?.slice(0, 6)" :key="index">
              <div class="p-2">
                <router-link :to="{ path: '/product', query: { search: book.title } }" class="text-decoration-none">
                  <img :src="book.volumes[0].cover" alt="Book Cover"
                       class="img-fluid rounded shadow-sm" style="height: 300px; width: 100%;">
                  <h5 class="mt-2 fw-semibold text-dark">{{ book.title }}</h5>
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- About Us -->
      <div style="background-color: #fff5f8;">
        <div class="container py-5">
          <div class="row align-items-center g-5">
            <div class="col-12 col-md-6 d-flex justify-content-center align-items-center">
              <img src="images/logo_full.png" alt="About Us" class="img-fluid">
            </div>
            <div class="col-12 col-md-6">
              <h1 class="mb-4 fs-1 fw-bold text-primary">About Us</h1>
              <p class="fs-5 lh-lg text-muted text-justify">
                At <strong>BOOK☆RUNNER</strong>, our passion lies in delivering the finest manga and light novels to your fingertips.  
                We carefully curate a diverse collection that appeals to every reader — from beloved classics to the freshest releases.  
                Whether you're a seasoned manga enthusiast or just beginning your journey, you'll find something here to ignite your imagination. 📘🏃‍♂️
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      books: [],
      keyword: "Bestsellers",
      genres: [
        "Adventure", "Action", "Romance", "Comedy", 
        "Drama", "Fantasy", "Mystery"
      ],
      genresPerPage: 6,
      currentPage: 1,
      stats: [
        { value: "4.9/5⭐", label: "Average rating" },
        { value: "1M+", label: "Copies sold per year" },
        { value: "100K", label: "Books available" },
      ]
    };
  },

  computed: {
    totalPages() {
      return Math.ceil(this.genres.length / this.genresPerPage);
    },
    visibleGenres() {
      const start = (this.currentPage - 1) * this.genresPerPage;
      return this.genres.slice(start, start + this.genresPerPage);
    }
  },

  mounted() {
    fetch("books.json")
      .then((res) => res.json())
      .then((data) => {
        this.books = data.filter(book =>
          book.keywords.some(k => k.toLowerCase() === this.keyword.toLowerCase())
        );
      })
      .catch((err) => console.error("Error loading book data:", err));
  },

  methods: {
    goToPage(page) {
      if (page >= 1 && page <= this.totalPages) {
        this.currentPage = page;
      }
    }
  }
};
