const Book = {
  template: `
  <div class="bookrunner-bg">
    <div class="container mt-5">
      <div class="row gx-lg-1 justify-content-center align-items-stretch"> 

        <!-- Book Cover -->
        <div class="col-12 col-lg-5 d-flex justify-content-center align-items-center mx-5 rounded-3 p-0" 
            style="height: 550px; width: 350px; border: 2px solid #ccc; overflow: hidden;">
          <img :src="cover" class="img-fluid w-100 h-100 object-fit-cover" alt="Book Cover">
        </div>

        <!-- Book Info -->
        <div class="col-12 col-lg-7 d-flex flex-column justify-content-between" style="max-height: 550px;">
          <h2 class="fs-2 fw-semibold mb-1 text-center text-lg-start mt-4 mt-lg-0">
            {{ title }} Vol. {{ volume }} 
            <span class="fs-6 author-text d-none d-lg-inline">By {{ author }}</span>
          </h2>
          <h2 class="fs-4 fw-semibold mb-3 text-center text-lg-start">RM{{ (price - 0.01).toFixed(2) }}</h2>
          <p class="mb-2 fs-6 text-justify text-lg-start" style="white-space: pre-line;">{{ description }}</p>

          <!-- Quantity Selector -->
          <div class="d-flex align-items-center my-3">
            <label for="quantity" class="me-2 fs-5 fw-semibold">Quantity:</label>
            <button class="btn btn-theme-accent rounded-start" @click="decreaseQty"><i class="bi bi-dash"></i></button>
            <input type="number" class="form-control mx-2 text-center border-start-0 border-end-0 fw-semibold" 
                   readonly v-model.number="quantity" min="1" style="width: 60px;">
            <button class="btn btn-theme-accent rounded-end" @click="increaseQty"><i class="bi bi-plus"></i></button>
          </div>

          <!-- Add to Cart -->
          <button class="btn btn-theme-primary w-100 py-2" @click="addToCart()">
            <i class="mdi mdi-cart-plus"></i> Add to Cart
          </button>
          <p v-if="successMessage" class="alert alert-success mt-2 text-center">{{ successMessage }}</p>
        </div>
      </div>

      <!-- Book Details Table -->
      <div class="row justify-content-center">
        <div class="col-12 col-lg-8 my-5">
          <h2 class="fs-1 fw-semibold mb-3">Book Details</h2>
          <table class="table table-borderless mb-5">
            <tbody>
              <tr v-for="(row, index) in detailRows" :key="index" class="border-bottom align-middle">
                <th scope="row" class="text-muted fw-semibold" style="width: 30%; background: #e3f2fd;">{{ row.label }}</th>
                <td>
                  <template v-if="Array.isArray(row.value)">
                    <span v-for="(val, i) in row.value" :key="i" :class="row.badgeClass + ' me-1 mb-1 d-inline-block'">{{ val }}</span>
                  </template>
                  <template v-else>
                    <span class="fs-6">{{ row.value }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`,

  data() {
    return {
      title: "",
      author: "",
      price: "",
      description: "",
      volume: "",
      cover: "",
      publisher: "",
      genre: [],
      keywords: [],
      quantity: 1,
      page_count: 0,
      date: "",
      successMessage: "",
      authState: null,
    };
  },

  created() {
    this.title = decodeURIComponent(this.$route.params.title);
    this.volume = this.$route.params.volume;
    this.authState = Vue.inject("authState");
    this.fetchBookDetails();
  },

  computed: {
    detailRows() {
      return [
        { label: "Title", value: this.title },
        { label: "Author", value: this.author },
        { label: "Publisher", value: this.publisher },
        { label: "Genre", value: this.genre, badgeClass: "badge bg-primary" },
        { label: "Keywords", value: this.keywords, badgeClass: "badge bg-secondary" },
        { label: "Release date", value: this.date },
        { label: "Page count", value: this.page_count },
      ];
    },
  },

  methods: {
    fetchBookDetails() {
      fetch("books.json")
        .then((response) => response.json())
        .then((data) => {
          const book = data.find((b) => b.title === this.title);
          const volume = book?.volumes.find((v) => v.volumeNumber == this.volume);

          if (book && volume) {
            Object.assign(this, {
              title: book.title,
              author: book.author,
              price: book.price,
              description: book.description,
              publisher: book.publisher,
              genre: book.genre,
              keywords: book.keywords,
              cover: volume.cover,
              date: volume.release_date,
              page_count: volume.page_count,
              volume: volume.volumeNumber,
            });
          } else {
            console.error(book ? "Volume not found" : "Book not found");
          }
        })
        .catch((err) => console.error("Error loading book data:", err));
    },

    increaseQty() {
      if (this.quantity < 10) this.quantity++;
    },

    decreaseQty() {
      if (this.quantity > 1) this.quantity--;
    },

    addToCart() {
      const token = this.authState?.user?.token;
      if (!this.authState?.isLoggedIn || !token) {
        this.$router.push("/login");
        return;
      }

      fetch("resources/api_cart.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          book_title: this.title,
          volume: this.volume,
          quantity: this.quantity,
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          return { ok: res.ok, status: res.status, data };
        })
        .then((data) => {
          if (data.ok && data.data?.id) {
            this.successMessage = "Successfully added to cart!";
            setTimeout(() => (this.successMessage = ""), 3000);
          } else if (data.status === 401) {
            this.authState.isLoggedIn = false;
            this.authState.user = null;
            this.$router.push("/login");
          } else {
            alert("Failed to add to cart.");
          }
        });
    },
  },
};
