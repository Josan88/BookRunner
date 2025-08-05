const Product = {
    components: {
        paginate: VuejsPaginateNext,
    },

    template: `
        <div class="bookrunner-bg">
            <div class="container-fluid">
                <!-- Banner -->
                <div class="row justify-content-center align-items-center flex-column text-center product_header mx-0 my-5">
                    <div class="col-12">
                        <h1 class="display-6 fw-bold text-primary-emphasis">Explore Our Manga & Light Novel Collection</h1>
                        <p class="lead fs-5 fw-semibold d-none d-sm-block">
                        Find your next adventure by filtering by type, publisher, genre, or searching by keywords.
                        </p>
                    </div>
                </div>

                <div class="container">
                <!-- Mobile Search -->
                <div class="row d-sm-none mb-3">
                    <div class="col-12">
                    <label class="form-label">Search</label>
                    <div class="input-group">
                        <input
                        v-model="searchQuery"
                        @input="fetchResults(searchQuery)"
                        class="form-control"
                        placeholder="Title, Author or Keywords...">
                    </div>
                    </div>
                </div>

                <!-- Sort and Count (Desktop) -->
                <div class="row align-items-center mb-3 d-none d-sm-flex">
                    <div class="col-md-6">
                    <span class="fw-semibold">Showing {{ shownCount }} of {{ flattenedResults.length }} products</span>
                    </div>
                    <div class="col-md-6 text-md-end">
                    <label for="sortBy" class="me-2 fw-semibold">Sort by:</label>
                    <select id="sortBy" class="form-select d-inline-block w-auto" v-model="sortBy" @change="sortResults">
                        <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                        {{ option.text }}
                        </option>
                    </select>
                    </div>
                </div>

                <div class="row">
                    <!-- Filter Button (Mobile) -->
                    <div class="col-12 d-sm-none mb-3">
                    <button class="btn btn-outline-primary w-100" @click="showMobileFilter = !showMobileFilter">
                        <i class="bi bi-funnel"></i> Filter
                    </button>
                    </div>

                    <!-- Filter Card -->
                    <div
                    class="col-12 col-md-4 col-lg-3 mb-4"
                    :class="{
                        'd-none': !showMobileFilter && windowWidth < 576,
                        'd-block': showMobileFilter && windowWidth < 576
                    }"
                    style="z-index: 1050; position: relative;"
                    >
                    <div class="card p-3">
                        <!-- Desktop Search -->
                        <label class="form-label d-none d-sm-block">Search</label>
                        <div class="mb-3 input-group d-none d-sm-flex">
                        <input
                            v-model="searchQuery"
                            @input="fetchResults(searchQuery)"
                            class="form-control"
                            placeholder="Title, Author or Keywords...">
                        </div>
                        <hr class="d-none d-sm-block">

                        <!-- Type Filter -->
                        <div class="mb-3">
                        <label class="form-label">Type</label>
                        <div v-if="windowWidth >= 576">
                            <div class="form-check" v-for="t in type" :key="'type-' + t">
                            <input
                                type="radio"
                                class="form-check-input"
                                :id="'type-' + t"
                                name="type"
                                :value="t"
                                v-model="selectedType"
                                @change="fetchResults(searchQuery)">
                            <label class="form-check-label" :for="'type-' + t">{{ t }}</label>
                            </div>
                        </div>
                        <div v-else>
                            <select class="form-select" v-model="selectedTypeMobile" @change="fetchResults(searchQuery)">
                            <option value="">All</option>
                            <option v-for="t in type" :key="'type-mobile-' + t" :value="t">{{ t }}</option>
                            </select>
                        </div>
                        <hr>
                        </div>

                        <!-- Publisher Filter -->
                        <div class="mb-3">
                        <label class="form-label">Publisher</label>
                        <div v-if="windowWidth >= 576">
                            <div class="form-check" v-for="p in publishers" :key="'publisher-' + p">
                            <input
                                type="checkbox"
                                class="form-check-input"
                                :id="'publisher-' + p"
                                :value="p"
                                v-model="selectedPublishers"
                                @change="fetchResults(searchQuery)">
                            <label class="form-check-label" :for="'publisher-' + p">{{ p }}</label>
                            </div>
                        </div>
                        <div v-else>
                            <select class="form-select" v-model="selectedPublisherMobile" @change="fetchResults(searchQuery)">
                            <option value="">All</option>
                            <option v-for="p in publishers" :key="'publisher-mobile-' + p" :value="p">{{ p }}</option>
                            </select>
                        </div>
                        <hr>
                        </div>

                        <!-- Genre Filter -->
                        <div class="mb-3">
                        <label class="form-label">Genre</label>
                        <div v-if="windowWidth >= 576">
                            <div class="form-check" v-for="g in genre" :key="'genre-' + g">
                            <input
                                type="checkbox"
                                class="form-check-input"
                                :id="'genre-' + g"
                                :value="g"
                                v-model="selectedGenres"
                                @change="fetchResults(searchQuery)">
                            <label class="form-check-label" :for="'genre-' + g">{{ g }}</label>
                            </div>
                        </div>
                        <div v-else>
                            <select class="form-select" v-model="selectedGenreMobile" @change="fetchResults(searchQuery)">
                            <option value="">All</option>
                            <option v-for="g in genre" :key="'genre-mobile-' + g" :value="g">{{ g }}</option>
                            </select>
                        </div>
                        <hr>
                        </div>

                        <!-- Price Filter -->
                        <div class="mb-3">
                        <label class="form-label">Price Range</label>
                        <div class="d-flex align-items-center gap-2">
                            <div class="input-group" style="width: 45%;">
                            <span class="input-group-text">RM</span>
                            <input
                                type="number"
                                class="form-control"
                                v-model.number="minPrice"
                                @change="fetchResults(searchQuery)"
                                placeholder="Min">
                            </div>
                            <span>to</span>
                            <div class="input-group" style="width: 45%;">
                            <span class="input-group-text">RM</span>
                            <input
                                type="number"
                                class="form-control"
                                v-model.number="maxPrice"
                                @change="fetchResults(searchQuery)"
                                placeholder="Max">
                            </div>
                        </div>
                        </div>
                    </div>
                    </div>

                    <!-- Product Grid -->
                    <div class="col-12 col-md-8 col-lg-9">
                    <div class="row row-cols-1 row-cols-md-2 row-cols-lg-4 g-4 mx-6 mx-sm-0">
                        <div class="col" v-for="manga in paginatedResults" :key="manga.title + '-Vol' + manga.volumeNumber">
                        <router-link :to="getBookLink(manga)" class="text-decoration-none">
                            <div class="card h-100 d-flex flex-column">
                            <img
                                :src="manga.cover"
                                :alt="manga.title"
                                class="card-img-top img-fluid mx-auto d-block"
                                style="height: 18.75rem; object-fit: cover;">
                            <div class="card-body d-flex flex-column justify-content-between">
                                <p class="card-title text-center fw-medium fs-5 text-wrap" style="max-height: 3em; line-height: 1.5em; overflow: hidden;">
                                {{ manga.title }} Vol. {{ manga.volumeNumber }}
                                </p>
                                <p class="card-text text-center fw-bold fs-4">RM{{ manga.price - 0.01 }}</p>
                                <p class="card-text text-center fs-6 text-body-secondary">{{ manga.author }}</p>
                            </div>
                            </div>
                        </router-link>
                        </div>

                        <!-- Pagination -->
                        <paginate
                        :page-count="pageCount"
                        :page-range="3"
                        :margin-pages="1"
                        :click-handler="clickCallback"
                        prev-text="← Prev"
                        next-text="Next →"
                        container-class="pagination justify-content-center mt-4 w-100"
                        page-class="page-item"
                        page-link-class="page-link"
                        prev-class="page-item prev-item"
                        next-class="page-item next-item"
                        active-class="active">
                        </paginate>
                    </div>
                    </div>
                </div>
                </div>
            </div>
        </div>`,

    data() {
        return {
            showMobileFilter: false,
            windowWidth: window.innerWidth,
            results: [],
            currentPage: 1,
            itemsPerPage: 8,
            searchQuery: "",
            sortBy: "title-asc",

            selectedType: "All",
            selectedPublishers: [],
            selectedGenres: [],

            selectedTypeMobile: "All",
            selectedPublisherMobile: "",
            selectedGenreMobile: "",

            minPrice: 1,
            maxPrice: 30,

            type: ["All", "Manga", "Light Novel"],
            genre: ["Adventure", "Action", "Romance", "Comedy", "Drama", "Fantasy", "Mystery"],
            publishers: ["Shueisha", "Yen Press", "Seven Seas Entertainment", "Viz Media", "Kodansha", "KADOKAWA"],

            sortOptions: [
            { value: "title-asc", text: "Title (A-Z)" },
            { value: "title-desc", text: "Title (Z-A)" },
            { value: "price-asc", text: "Price (Low to High)" },
            { value: "price-desc", text: "Price (High to Low)" },
            ],
        };
    },

    mounted() {
        window.scrollTo(0, 0);
        window.addEventListener("resize", this.handleResize);

        const genreFromQuery = this.$route?.query?.genre;
        const searchFromQuery = this.$route?.query?.search;

        if (genreFromQuery && this.genre.includes(genreFromQuery)) {
            this.selectedGenres = [genreFromQuery];
        }
        if (searchFromQuery) {
            this.searchQuery = searchFromQuery;
        }

        this.fetchResults(this.searchQuery);
        },

        beforeUnmount() {
        window.removeEventListener("resize", this.handleResize);
        },

        methods: {
        handleResize() {
            this.windowWidth = window.innerWidth;
            if (this.windowWidth >= 576) {
            this.showMobileFilter = false;
            }
        },

        getBookLink(manga) {
            const title = encodeURIComponent(manga.title);
            return `/book/${title}/${manga.volumeNumber}`;
        },

        sortResults() {
            this.currentPage = 1; // Reactivity trigger
        },

        async fetchResults(query) {
            this.currentPage = 1;

            try {
            const response = await fetch("books.json");
            if (!response.ok) throw new Error("Failed to load data");

            const allData = await response.json();

            this.results = allData.filter((book) => {
                const queryLower = query.toLowerCase();
                const matchesQuery =
                book.title.toLowerCase().includes(queryLower) ||
                book.author.toLowerCase().includes(queryLower) ||
                book.type.toLowerCase().includes(queryLower) ||
                book.genre.some((g) => g.toLowerCase().includes(queryLower)) ||
                book.keywords?.some((k) => k.toLowerCase().includes(queryLower));

                const typeFilter = this.windowWidth >= 576 ? this.selectedType : this.selectedTypeMobile;
                const matchesType =
                typeFilter === "All" || typeFilter === "" || book.type.toLowerCase() === typeFilter.toLowerCase();

                const publisherFilter = this.windowWidth >= 576 ? this.selectedPublishers : [this.selectedPublisherMobile];
                const matchesPublisher =
                publisherFilter.length === 0 || publisherFilter.includes(book.publisher);

                const genreFilter = this.windowWidth >= 576 ? this.selectedGenres : [this.selectedGenreMobile];
                const matchesGenre =
                genreFilter.length === 0 || genreFilter.includes("All") || genreFilter.some((g) => book.genre.includes(g));

                const matchesMin = this.minPrice == null || book.price >= this.minPrice;
                const matchesMax = this.maxPrice == null || book.price <= this.maxPrice;

                return matchesQuery && matchesType && matchesPublisher && matchesGenre && matchesMin && matchesMax;
            });
            } catch (err) {
            console.error(err);
            }
        },

        clickCallback(pageNum) {
            this.currentPage = pageNum;
        },
    },

    computed: {
        flattenedResults() {
            const flattened = this.results.flatMap((manga) =>
            manga.volumes.map((volume) => ({
                title: manga.title,
                author: manga.author,
                price: manga.price,
                volumeNumber: volume.volumeNumber,
                cover: volume.cover,
            }))
            );

            switch (this.sortBy) {
            case "title-desc":
                return flattened.sort((a, b) => b.title.localeCompare(a.title));
            case "price-asc":
                return flattened.sort((a, b) => a.price - b.price);
            case "price-desc":
                return flattened.sort((a, b) => b.price - a.price);
            case "title-asc":
            default:
                return flattened.sort((a, b) => a.title.localeCompare(b.title));
            }
        },

        paginatedResults() {
            const start = (this.currentPage - 1) * this.itemsPerPage;
            return this.flattenedResults.slice(start, start + this.itemsPerPage);
        },

        pageCount() {
            return Math.ceil(this.flattenedResults.length / this.itemsPerPage);
        },

        shownCount() {
            return Math.min(this.currentPage * this.itemsPerPage, this.flattenedResults.length);
        },
    }
};