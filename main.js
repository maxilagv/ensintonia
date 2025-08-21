// Importar módulos de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importar la configuración de Firebase desde tu archivo centralizado
// Asegúrate de que este archivo 'firebaseconfig.js' exista y contenga tus configuraciones de db y auth.
import { db, auth, firebaseConfig } from './firebaseconfig.js';

// Variables globales de Firebase (proporcionadas por el entorno Canvas)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let app; // 'app' se inicializará aquí usando firebaseConfig
let userId;
let categoriesData = []; // Para almacenar las categorías cargadas

// Nuevas variables de estado para controlar la carga inicial
let categoriesInitialLoadComplete = false;
let productsInitialLoadComplete = false;

/**
 * @function checkAndHideMainLoader
 * @description Verifica si todas las cargas iniciales (categorías y productos) han finalizado
 * y oculta el loader principal si es así.
 */
function checkAndHideMainLoader() {
    console.log("checkAndHideMainLoader - categoriesInitialLoadComplete:", categoriesInitialLoadComplete, "productsInitialLoadComplete:", productsInitialLoadComplete);
    if (categoriesInitialLoadComplete && productsInitialLoadComplete) {
        console.log("checkAndHideMainLoader - Ambas cargas iniciales completas. Ocultando loader futurista.");
        hideLoading('futuristic-loader');
    }
}

/**
 * @function initFirebase
 * @description Inicializa la aplicación Firebase y configura la autenticación.
 * Maneja el inicio de sesión con token personalizado o de forma anónima.
 * También escucha los cambios en el estado de autenticación para cargar las categorías.
 */
async function initFirebase() {
    console.log("initFirebase - Iniciando inicialización de Firebase...");
    try {
        // 'app' ahora se inicializa aquí usando la firebaseConfig importada
        app = initializeApp(firebaseConfig);
        // 'db' y 'auth' ya vienen importados de firebaseconfig.js

        // Iniciar sesión con token personalizado si está disponible, de lo contrario, de forma anónima
        if (initialAuthToken) {
            console.log("initFirebase - Intentando iniciar sesión con token personalizado.");
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            console.log("initFirebase - Intentando iniciar sesión anónimamente.");
            await signInAnonymously(auth);
        }

        // Escuchar cambios en el estado de autenticación
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                console.log("initFirebase - Firebase inicializado. ID de Usuario:", userId);
                document.getElementById('user-id-display').textContent = `ID de Usuario: ${userId}`;

                // Cargar categorías y productos después de la autenticación
                console.log("initFirebase - Llamando a loadCategories y loadAllProducts.");
                loadCategories();
                loadAllProducts();
            } else {
                console.log("initFirebase - Ningún usuario ha iniciado sesión. Marcando cargas como completas.");
                userId = null;
                document.getElementById('user-id-display').textContent = 'ID de Usuario: No autenticado';
                // Si no hay usuario, marcar ambas cargas como completas para ocultar el loader
                categoriesInitialLoadComplete = true;
                productsInitialLoadComplete = true;
                checkAndHideMainLoader();
            }
        });

    } catch (error) {
        console.error("initFirebase - Error al inicializar Firebase:", error);
        showMessageBox("Error al inicializar la aplicación. Por favor, inténtalo de nuevo más tarde.");
        // Asegurar que el loader se oculte incluso si hay un error de inicialización de Firebase
        categoriesInitialLoadComplete = true;
        productsInitialLoadComplete = true;
        checkAndHideMainLoader();
    }
}

/**
 * @function showLoading
 * @description Muestra un spinner de carga específico.
 * @param {string} spinnerId - El ID del elemento del spinner a mostrar.
 */
function showLoading(spinnerId) {
    console.log("showLoading - Mostrando loader:", spinnerId);
    const loader = document.getElementById(spinnerId);
    if (loader) { // Asegurarse de que el loader existe
        loader.classList.remove('hidden');
        if (spinnerId === 'futuristic-loader') {
            document.body.style.overflow = 'hidden'; // Evita el scroll solo para el loader de página completa
        }
    }
}

/**
 * @function hideLoading
 * @description Oculta un spinner de carga específico.
 * @param {string} spinnerId - El ID del elemento del spinner a ocultar.
 */
function hideLoading(spinnerId) {
    console.log("hideLoading - Ocultando loader:", spinnerId);
    const loader = document.getElementById(spinnerId);
    if (loader) { // Asegurarse de que el loader existe
        if (spinnerId === 'futuristic-loader') {
            loader.style.opacity = '0'; // Inicia la transición de opacidad
            // Asegurarse de que la clase 'hidden' se aplique después de la transición
            setTimeout(() => {
                loader.classList.add('hidden'); // Oculta después de la transición
                document.body.style.overflow = ''; // Restaura el scroll
            }, 500); // 500ms coincide con la duración de la transición CSS
        } else {
            loader.classList.add('hidden');
        }
    }
}

/**
 * @function loadCategories
 * @description Carga las categorías desde Firestore en tiempo real y las renderiza en la página
 * y en el submenú de categorías del menú móvil.
 */
async function loadCategories() {
    console.log("loadCategories - Iniciando carga de categorías.");
    if (!db) {
        console.error("loadCategories - Firestore no inicializado. No se pueden cargar categorías.");
        categoriesInitialLoadComplete = true; // Marcar como cargado incluso si Firestore no está listo
        checkAndHideMainLoader();
        return;
    }
    showLoading('categories-loading-spinner'); // Muestra el loader de categorías

    const categoriesCol = collection(db, `artifacts/${appId}/public/data/categories`);

    onSnapshot(categoriesCol, (snapshot) => {
        console.log("loadCategories - onSnapshot recibido. Número de categorías:", snapshot.size);
        categoriesData = []; // Limpiar datos de categorías anteriores
        const categoriesContainer = document.getElementById('categories-container');
        const categoriesSubmenu = document.getElementById('categories-submenu');

        categoriesContainer.innerHTML = ''; // Limpiar categorías existentes en la sección principal
        categoriesSubmenu.innerHTML = ''; // Limpiar categorías existentes en el submenú

        if (snapshot.empty) {
            console.log("loadCategories - No hay categorías en Firestore.");
            categoriesContainer.innerHTML = '<p class="text-center text-gray-600 col-span-full">No hay categorías disponibles en este momento.</p>';
            categoriesSubmenu.innerHTML = '<li class="text-gray-600 text-lg py-2">No hay categorías.</li>';
        } else {
            snapshot.forEach(doc => {
                const category = { id: doc.id, ...doc.data() };
                categoriesData.push(category); // Almacenar la categoría con su ID
                console.log("loadCategories - Categoría cargada:", category.name);

                // Renderizar en la sección principal
                const categoryCard = `
                    <div class="product-card bg-white rounded-xl shadow-xl overflow-hidden cursor-pointer" onclick="goToCategory('${category.name}')">
                        <img src="${category.imageUrl || 'https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen'}" alt="${category.name}" class="w-full h-48 sm:h-52 object-cover transition duration-300 ease-in-out transform hover:scale-105">
                        <div class="p-6 sm:p-7">
                            <h3 class="text-2xl sm:text-3xl font-semibold mb-2 sm:mb-3 text-gray-900">${category.name}</h3>
                            <p class="text-base sm:text-lg text-gray-700 mb-4 sm:mb-5">${category.description || 'Descripción no disponible.'}</p>
                            <button class="btn-primary text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg w-full">Ver Categoría</button>
                        </div>
                    </div>
                `;
                categoriesContainer.innerHTML += categoryCard;

                // Renderizar en el submenú móvil
                const submenuItem = `
                    <li>
                        <a href="#catalogo-productos" onclick="goToCategory('${category.name}'); closeMobileMenu();" class="block py-2 text-xl text-gray-700 hover:text-blue-600 transition duration-200">
                            ${category.name}
                        </a>
                    </li>
                `;
                categoriesSubmenu.innerHTML += submenuItem;
            });
        }
        hideLoading('categories-loading-spinner'); // Oculta el loader de categorías
        categoriesInitialLoadComplete = true; // Marcar categorías como cargadas
        checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
    }, (error) => {
        console.error("loadCategories - Error al obtener categorías:", error);
        showMessageBox("Error al cargar las categorías. Por favor, inténtalo de nuevo.");
        hideLoading('categories-loading-spinner'); // Oculta el loader de categorías incluso si hay un error
        categoriesInitialLoadComplete = true; // Marcar categorías como cargadas incluso con error
        checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
    });
}

/**
 * @function addCategory
 * @description Añade una nueva categoría a Firestore. Esta función sería utilizada por un panel de administración.
 * @param {string} name - Nombre de la categoría.
 * @param {string} description - Descripción de la categoría.
 * @param {string} imageUrl - URL de la imagen de la categoría (debería provenir de Cloud Storage).
 */
async function addCategory(name, description, imageUrl) {
    if (!db || !userId) {
        showMessageBox("Error: Firebase o usuario no autenticado. No se puede añadir la categoría.");
        return;
    }
    try {
        const newCategoryRef = await addDoc(collection(db, `artifacts/${appId}/public/data/categories`), {
            name: name,
            description: description,
            imageUrl: imageUrl,
            createdAt: new Date()
        });
        console.log("Categoría añadida con ID: ", newCategoryRef.id);
        showMessageBox(`Categoría "${name}" añadida con éxito.`);
    }
    catch (e) {
        console.error("Error al añadir la categoría: ", e);
        showMessageBox("Error al añadir la categoría. Inténtalo de nuevo.");
    }
}

/**
 * @function addProduct
 * @description Añade un nuevo producto a Firestore. Esta función sería utilizada por un panel de administración.
 * @param {string} name - Nombre del producto.
 * @param {number} price - Precio del producto.
 * @param {string} imageUrl - URL de la imagen del producto (debería provenir de Cloud Storage).
 * @param {string} categoryName - Nombre de la categoría a la que pertenece el producto.
 * @param {string} description - Descripción del producto.
 * @param {string} [componentsUrl] - URL opcional a la página de componentes del producto.
 * @param {string} [videoUrl] - URL opcional de un video para el producto (ej. YouTube embed URL o link directo a .mp4).
 */
async function addProduct(name, price, imageUrl, categoryName, description, componentsUrl = null, videoUrl = null) {
    if (!db || !userId) {
        showMessageBox("Error: Firebase o usuario no autenticado. No se puede añadir el producto.");
        return;
    }
    try {
        const newProductRef = await addDoc(collection(db, `artifacts/${appId}/public/data/products`), {
            name: name,
            price: price,
            imageUrl: imageUrl,
            category: categoryName, // Se guarda el nombre de la categoría
            description: description,
            componentsUrl: componentsUrl,
            videoUrl: videoUrl, // ¡Nuevo campo para el link de video!
            createdAt: new Date()
        });
        console.log("Producto añadido con ID: ", newProductRef.id);
        showMessageBox(`Producto "${name}" añadido con éxito.`);
    }
    catch (e) {
        console.error("Error al añadir el producto: ", e);
        showMessageBox("Error al añadir el producto. Inténtalo de nuevo.");
    }
}

/**
 * @function loadAllProducts
 * @description Carga todos los productos desde Firestore y los muestra en el contenedor de productos.
 */
async function loadAllProducts() {
    console.log("loadAllProducts - Iniciando carga de todos los productos.");
    if (!db) {
        console.error("loadAllProducts - Firestore no inicializado. No se pueden cargar productos.");
        productsInitialLoadComplete = true; // Marcar como cargado incluso si Firestore no está listo
        checkAndHideMainLoader();
        return;
    }

    showLoading('products-loading-spinner'); // Muestra el loader de productos
    const productContainer = document.getElementById("contenedor-productos");
    productContainer.innerHTML = ''; // Limpia antes de agregar

    try {
        const productsColRef = collection(db, `artifacts/${appId}/public/data/products`);
        onSnapshot(productsColRef, (snapshot) => {
            console.log("loadAllProducts - onSnapshot recibido. Número de productos:", snapshot.size);
            productContainer.innerHTML = ''; // Limpia en cada actualización
            if (snapshot.empty) {
                console.log("loadAllProducts - No hay productos en Firestore.");
                productContainer.innerHTML = '<p class="text-center text-gray-600 col-span-full">No hay productos disponibles en esta sección.</p>';
            } else {
                snapshot.forEach(doc => {
                    // Se extraen los nuevos campos componentsUrl y videoUrl
                    const { name, price, imageUrl, description, componentsUrl, videoUrl } = doc.data();
                    console.log("loadAllProducts - Producto cargado:", name);
                    console.log("loadAllProducts - Video URL para producto", name, ":", videoUrl); // DEBUG: Log de la URL del video

                    let mediaHtml = '';
                    if (videoUrl) {
                        const youtubeMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|)([\w-]{11})(?:\S+)?/);
                        const streamableMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?streamable\.com\/([\w-]+)(?:\S+)?/); // Nuevo regex para Streamable

                        if (youtubeMatch && youtubeMatch[1]) {
                            const embedUrl = `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=0&controls=1&mute=1&loop=1&playlist=${youtubeMatch[1]}`;
                            mediaHtml = `
                                <div class="relative w-full" style="padding-bottom: 56.25%;"> <!-- 16:9 Aspect Ratio -->
                                    <iframe
                                        class="absolute top-0 left-0 w-full h-full rounded-t-xl"
                                        src="${embedUrl}"
                                        frameborder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowfullscreen
                                        onerror="console.error('Error al cargar iframe de YouTube para el producto ${name}'); this.src='https://placehold.co/600x400/cccccc/333333?text=Error+Video';"
                                    ></iframe>
                                </div>
                            `;
                            console.log("loadAllProducts - Usando iframe de YouTube para producto", name, ". URL:", embedUrl);
                        } else if (streamableMatch && streamableMatch[1]) { // Nuevo: Si es Streamable
                            const embedUrl = `https://streamable.com/e/${streamableMatch[1]}?autoplay=0&controls=1&muted=1&loop=0`; // Streamable embed URL
                            mediaHtml = `
                                <div class="relative w-full" style="padding-bottom: 56.25%;"> <!-- 16:9 Aspect Ratio -->
                                    <iframe
                                        class="absolute top-0 left-0 w-full h-full rounded-t-xl"
                                        src="${embedUrl}"
                                        frameborder="0"
                                        allow="autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowfullscreen
                                        onerror="console.error('Error al cargar iframe de Streamable para el producto ${name}'); this.src='https://placehold.co/600x400/cccccc/333333?text=Error+Video';"
                                    ></iframe>
                                </div>
                            `;
                            console.log("loadAllProducts - Usando iframe de Streamable para producto", name, ". URL:", embedUrl);
                        }
                        else {
                            // Si no es YouTube ni Streamable, asumir que es un video directo (ej. .mp4)
                            mediaHtml = `
                                <video 
                                    class="w-full h-40 object-cover rounded-t-xl" 
                                    controls 
                                    muted 
                                    loop 
                                    playsinline
                                    onerror="console.error('Error al cargar video directo para el producto ${name}'); this.parentNode.innerHTML='<img src=\\'https://placehold.co/600x400/cccccc/333333?text=Error+Video\\' alt=\\'Error de video\\' class=\\'w-full h-40 object-cover rounded-t-xl\\'>';"
                                >
                                    <source src="${videoUrl}" type="video/mp4">
                                    Tu navegador no soporta el tag de video.
                                </video>
                            `;
                            console.log("loadAllProducts - Usando video directo para producto", name, ". URL:", videoUrl);
                        }
                    } else if (imageUrl) {
                        mediaHtml = `<img src="${imageUrl}" alt="${name}" class="w-full h-40 object-cover rounded-t-xl" onerror="this.onerror=null;this.src='https://placehold.co/600x400/cccccc/333333?text=Imagen+No+Cargada';">`;
                    } else {
                        mediaHtml = `<img src="https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen" alt="Sin imagen" class="w-full h-40 object-cover rounded-t-xl">`;
                    }

                    let componentsButtonHtml = '';
                    if (componentsUrl) {
                        componentsButtonHtml = `
                            <a href="${componentsUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg w-full mt-4 flex items-center justify-center">
                                <i class="fas fa-microchip mr-2"></i> Ver Componentes
                            </a>
                        `;
                    }

                    const productCard = `
                        <div class="product-card bg-white rounded-xl shadow-lg overflow-hidden flex flex-col">
                            ${mediaHtml}
                            <div class="p-4 flex flex-col flex-grow">
                                <h3 class="text-lg font-semibold text-gray-800">${name}</h3>
                                <p class="text-gray-600 text-sm mt-1 flex-grow">${description || ''}</p>
                                <p class="text-blue-600 font-bold mt-2">$${price ? price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}</p>
                                ${componentsButtonHtml}
                            </div>
                        </div>
                    `;
                    productContainer.innerHTML += productCard;
                });
            }
            hideLoading('products-loading-spinner'); // Oculta el loader de productos
            productsInitialLoadComplete = true; // Marcar productos como cargados
            checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
        }, (error) => {
            console.error("loadAllProducts - Error al cargar productos:", error);
            showMessageBox("Error al cargar productos. Inténtalo más tarde.");
            hideLoading('products-loading-spinner'); // Oculta el loader de productos incluso si hay un error
            productsInitialLoadComplete = true; // Marcar productos como cargados incluso con error
            checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
        });
    } catch (error) {
        console.error("loadAllProducts - Error al configurar listener de productos:", error);
        showMessageBox("Error al cargar productos. Inténtalo más tarde.");
        hideLoading('products-loading-spinner'); // Oculta el loader de productos
        productsInitialLoadComplete = true; // Marcar productos como cargados incluso con error
        checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
    }
}

/**
 * @function loadProductsByCategory
 * @description Carga productos filtrados por categoría desde Firestore y los muestra.
 * @param {string} categoryName - El NOMBRE de la categoría para filtrar.
 */
async function loadProductsByCategory(categoryName) {
    console.log("loadProductsByCategory - Iniciando carga de productos por categoría:", categoryName);
    if (!db) {
        console.error("loadProductsByCategory - Firestore no inicializado. No se pueden cargar productos por categoría.");
        return;
    }

    showLoading('products-loading-spinner'); // Muestra el loader de productos
    const productContainer = document.getElementById("contenedor-productos");
    productContainer.innerHTML = ''; // Limpia antes de agregar

    try {
        const productsColRef = collection(db, `artifacts/${appId}/public/data/products`);
        // MODIFICADO: Ahora el filtro usa el campo 'category' con el nombre de la categoría
        const q = query(productsColRef, where("category", "==", categoryName)); 

        onSnapshot(q, (snapshot) => {
            console.log("loadProductsByCategory - onSnapshot recibido para categoría. Número de productos:", snapshot.size);
            productContainer.innerHTML = ''; // Limpia en cada actualización
            if (snapshot.empty) {
                console.log("loadProductsByCategory - No hay productos en esta categoría.");
                productContainer.innerHTML = `<p class="text-center text-gray-600 col-span-full">No hay productos disponibles en la categoría "${categoryName}".</p>`;
            } else {
                snapshot.forEach(doc => {
                    // Se extraen los nuevos campos componentsUrl y videoUrl
                    const { name, price, imageUrl, description, componentsUrl, videoUrl } = doc.data();
                    console.log("loadProductsByCategory - Producto cargado por categoría:", name);
                    console.log("loadProductsByCategory - Video URL para producto", name, ":", videoUrl); // DEBUG: Log de la URL del video
                    
                    let mediaHtml = '';
                    if (videoUrl) {
                        const youtubeMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|)([\w-]{11})(?:\S+)?/);
                        const streamableMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?streamable\.com\/([\w-]+)(?:\S+)?/); // Nuevo regex para Streamable

                        if (youtubeMatch && youtubeMatch[1]) {
                            const embedUrl = `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=0&controls=1&mute=1&loop=1&playlist=${youtubeMatch[1]}`;
                            mediaHtml = `
                                <div class="relative w-full" style="padding-bottom: 56.25%;"> <!-- 16:9 Aspect Ratio -->
                                    <iframe
                                        class="absolute top-0 left-0 w-full h-full rounded-t-xl"
                                        src="${embedUrl}"
                                        frameborder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowfullscreen
                                        onerror="console.error('Error al cargar iframe de YouTube para el producto ${name}'); this.src='https://placehold.co/600x400/cccccc/333333?text=Error+Video';"
                                    ></iframe>
                                </div>
                            `;
                            console.log("loadProductsByCategory - Usando iframe de YouTube para producto", name, ". URL:", embedUrl);
                        } else if (streamableMatch && streamableMatch[1]) { // Nuevo: Si es Streamable
                            const embedUrl = `https://streamable.com/e/${streamableMatch[1]}?autoplay=0&controls=1&muted=1&loop=0`; // Streamable embed URL
                            mediaHtml = `
                                <div class="relative w-full" style="padding-bottom: 56.25%;"> <!-- 16:9 Aspect Ratio -->
                                    <iframe
                                        class="absolute top-0 left-0 w-full h-full rounded-t-xl"
                                        src="${embedUrl}"
                                        frameborder="0"
                                        allow="autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowfullscreen
                                        onerror="console.error('Error al cargar iframe de Streamable para el producto ${name}'); this.src='https://placehold.co/600x400/cccccc/333333?text=Error+Video';"
                                    ></iframe>
                                </div>
                            `;
                            console.log("loadProductsByCategory - Usando iframe de Streamable para producto", name, ". URL:", embedUrl);
                        }
                        else {
                            mediaHtml = `
                                <video 
                                    class="w-full h-40 object-cover rounded-t-xl" 
                                    controls 
                                    muted 
                                    loop 
                                    playsinline
                                    onerror="console.error('Error al cargar video directo para el producto ${name}'); this.parentNode.innerHTML='<img src=\\'https://placehold.co/600x400/cccccc/333333?text=Error+Video\\' alt=\\'Error de video\\' class=\\'w-full h-40 object-cover rounded-t-xl\\'>';"
                                >
                                    <source src="${videoUrl}" type="video/mp4">
                                    Tu navegador no soporta el tag de video.
                                </video>
                            `;
                            console.log("loadProductsByCategory - Usando video directo para producto", name, ". URL:", videoUrl);
                        }
                    } else if (imageUrl) {
                        mediaHtml = `<img src="${imageUrl}" alt="${name}" class="w-full h-40 object-cover rounded-t-xl" onerror="this.onerror=null;this.src='https://placehold.co/600x400/cccccc/333333?text=Imagen+No+Cargada';">`;
                    } else {
                        mediaHtml = `<img src="https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen" alt="Sin imagen" class="w-full h-40 object-cover rounded-t-xl">`;
                    }

                    let componentsButtonHtml = '';
                    if (componentsUrl) {
                        componentsButtonHtml = `
                            <a href="${componentsUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg w-full mt-4 flex items-center justify-center">
                                <i class="fas fa-microchip mr-2"></i> Ver Componentes
                            </a>
                        `;
                    }

                    const productCard = `
                        <div class="product-card bg-white rounded-xl shadow-lg overflow-hidden flex flex-col">
                            ${mediaHtml}
                            <div class="p-4 flex flex-col flex-grow">
                                <h3 class="text-lg font-semibold text-gray-800">${name}</h3>
                                <p class="text-gray-600 text-sm mt-1 flex-grow">${description || ''}</p>
                                <p class="text-blue-600 font-bold mt-2">$${price ? price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}</p>
                                ${componentsButtonHtml}
                            </div>
                        </div>
                    `;
                    productContainer.innerHTML += productCard;
                });
            }
            hideLoading('products-loading-spinner'); // Oculta el loader de productos
            productsInitialLoadComplete = true; // Marcar productos como cargados
            checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
        }, (error) => {
            console.error("loadProductsByCategory - Error al cargar productos por categoría:", error);
            showMessageBox("Error al cargar productos por categoría. Inténtalo más tarde.");
            hideLoading('products-loading-spinner'); // Oculta el loader de productos incluso si hay un error
        });
    } catch (error) {
        console.error("loadProductsByCategory - Error al configurar listener de productos por categoría:", error);
        showMessageBox("Error al cargar productos por categoría. Inténtalo más tarde.");
        hideLoading('products-loading-spinner'); // Oculta el loader de productos
    }
}

/**
 * @function showMessageBox
 * @description Muestra un cuadro de mensaje personalizado en lugar de la alerta del navegador.
 * @param {string} message - El mensaje a mostrar.
 */
function showMessageBox(message) {
    const messageBox = document.createElement('div');
    messageBox.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    messageBox.innerHTML = `
        <div class="bg-white p-8 rounded-lg shadow-xl text-center max-w-sm mx-auto">
            <p class="text-xl font-semibold text-gray-800 mb-4">${message}</p>
            <button onclick="this.parentNode.parentNode.remove()" class="btn-primary text-white font-bold py-2 px-5 rounded-md">Cerrar</button>
        </div>
    `;
    document.body.appendChild(messageBox);
}

/**
 * @function goToCategory
 * @description Maneja la navegación a una categoría específica y carga sus productos.
 * @param {string} categoryName - El nombre de la categoría a la que navegar.
 * @param {string} categoryId (opcional) - El ID de la categoría en Firestore, aunque ya no se usa directamente para filtrar.
 */
function goToCategory(categoryName, categoryId) { // Mantiene categoryId para compatibilidad, aunque ya no se usa para la consulta
    showMessageBox(`Navegando a la categoría: ${categoryName}. Cargando productos...`);
    loadProductsByCategory(categoryName); // MODIFICADO: Pasa el nombre de la categoría para filtrar
    closeMobileMenu();
    // Desplazar la vista a la sección de productos
    document.getElementById('catalogo-productos').scrollIntoView({ behavior: 'smooth' });
}

/**
 * @function openMobileMenu
 * @description Abre el menú de navegación móvil y anima el botón de hamburguesa a una 'X'.
 */
function openMobileMenu() {
    const mobileNav = document.getElementById('mobile-nav');
    const mobileMenuButton = document.getElementById('mobile-menu-button');

    mobileNav.classList.remove('translate-x-full');
    mobileNav.classList.add('translate-x-0');
    mobileNav.classList.remove('hidden'); // Asegurarse de que el menú es visible

    mobileMenuButton.classList.add('open'); // Añadir clase para animar la hamburguesa a 'X'
    mobileMenuButton.setAttribute('aria-expanded', 'true'); // Actualizar estado de accesibilidad
}

/**
 * @function closeMobileMenu
 * @description Cierra el menú de navegación móvil y anima la 'X' de vuelta a hamburguesa.
 */
function closeMobileMenu() {
    const mobileNav = document.getElementById('mobile-nav');
    const mobileMenuButton = document.getElementById('mobile-menu-button');

    mobileNav.classList.remove('translate-x-0');
    mobileNav.classList.add('translate-x-full');

    // Ocultar el menú después de la transición
    mobileNav.addEventListener('transitionend', function handler() {
        mobileNav.classList.add('hidden');
        mobileNav.removeEventListener('transitionend', handler);
    });

    mobileMenuButton.classList.remove('open'); // Quitar clase para animar la 'X' de vuelta a hamburguesa
    mobileMenuButton.setAttribute('aria-expanded', 'false'); // Actualizar estado de accesibilidad

    closeCategoriesSubmenu(); // Asegurarse de cerrar el submenú de categorías también
}


/**
 * @function toggleCategoriesSubmenu
 * @description Alterna la visibilidad del submenú de categorías.
 */
function toggleCategoriesSubmenu() {
    const categoriesSubmenu = document.getElementById('categories-submenu');
    const categoriesToggleIcon = document.getElementById('categories-toggle-icon');
    categoriesSubmenu.classList.toggle('hidden');
    categoriesToggleIcon.classList.toggle('fa-chevron-down');
    categoriesToggleIcon.classList.toggle('fa-chevron-up');
}

/**
 * @function closeCategoriesSubmenu
 * @description Cierra el submenú de categorías.
 */
function closeCategoriesSubmenu() {
    const categoriesSubmenu = document.getElementById('categories-submenu');
    const categoriesToggleIcon = document.getElementById('categories-toggle-icon');
    if (!categoriesSubmenu.classList.contains('hidden')) {
        categoriesSubmenu.classList.add('hidden');
        categoriesToggleIcon.classList.remove('fa-chevron-up');
        categoriesToggleIcon.classList.add('fa-chevron-down');
    }
}


// Lógica para el menú de hamburguesa y submenús
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileNav = document.getElementById('mobile-nav');
    const categoriesToggleButton = document.getElementById('categories-toggle-button');

    // Referencias a los enlaces de Catálogo
    const catalogLinkMobile = document.getElementById('catalog-link-mobile');
    const catalogLinkDesktop = document.getElementById('catalog-link-desktop');

    // ** Lógica para el botón de hamburguesa: Alterna abrir/cerrar **
    mobileMenuButton.addEventListener('click', function(event) {
        event.stopPropagation(); // Evitar que el click se propague al body y cierre el menú
        if (mobileNav.classList.contains('translate-x-0')) { // Si el menú está abierto
            closeMobileMenu();
        } else { // Si el menú está cerrado
            openMobileMenu();
        }
    });

    // Toggle del submenú de categorías
    categoriesToggleButton.addEventListener('click', function(event) {
        event.stopPropagation(); // Evitar que el click se propague y cierre el menú principal
        toggleCategoriesSubmenu();
    });

    // Event listener para el enlace "Catálogo" en la navegación móvil
    if (catalogLinkMobile) {
        catalogLinkMobile.addEventListener('click', function(event) {
            event.preventDefault(); // Evitar el comportamiento predeterminado del ancla
            loadAllProducts(); // Cargar todos los productos
            closeMobileMenu(); // Cerrar el menú móvil
            // Desplazar la vista a la sección de productos
            document.getElementById('catalogo-productos').scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Event listener para el enlace "Catálogo" en la navegación de escritorio
    if (catalogLinkDesktop) {
        catalogLinkDesktop.addEventListener('click', function(event) {
            event.preventDefault(); // Evitar el comportamiento predeterminado del ancla
            loadAllProducts(); // Cargar todos los productos
            // Desplazar la vista a la sección de productos
            document.getElementById('catalogo-productos').scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Cerrar menú y submenús al hacer clic fuera
    document.body.addEventListener('click', function(event) {
        // Si el click no fue dentro del menú móvil ni en el botón de hamburguesa
        if (!mobileNav.contains(event.target) && !mobileMenuButton.contains(event.target)) {
            closeMobileMenu();
        }

        // Si el click no fue dentro del submenú de categorías ni en el botón de toggle de categorías
        // Y el submenú de categorías está visible
        const categoriesSubmenu = document.getElementById('categories-submenu');
        if (!categoriesSubmenu.classList.contains('hidden') &&
            !categoriesSubmenu.contains(event.target) &&
            !categoriesToggleButton.contains(event.target)) {
            closeCategoriesSubmenu();
        }
    });

    // Opcional: Cerrar el menú móvil cuando se hace clic en un enlace interno (excepto Categorías)
    // Los enlaces del submenú de categorías ya tienen closeMobileMenu() en su onclick
    mobileNav.querySelectorAll('a[href^="#"]').forEach(link => {
        // Asegurarse de que no sea el enlace de "Categorías" que abre el submenú
        if (link.id !== 'categories-toggle-button') {
            link.addEventListener('click', () => {
                closeMobileMenu();
            });
        }
    });
});


// Inicializar Firebase cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', initFirebase);

// Hacer que las funciones sean accesibles globalmente para eventos onclick en el HTML
window.showMessageBox = showMessageBox;
window.goToCategory = goToCategory;
window.addCategory = addCategory; // Exponer para posibles llamadas desde un futuro panel de administración
window.addProduct = addProduct;   // Exponer para posibles llamadas desde un futuro panel de administración
window.loadAllProducts = loadAllProducts; // Exponer para ser llamada desde los enlaces de catálogo
window.loadProductsByCategory = loadProductsByCategory; // Exponer para ser llamada desde los enlaces de categoría
window.closeMobileMenu = closeMobileMenu; // Exponer para ser llamada desde los enlaces del submenú
window.openMobileMenu = openMobileMenu; // Exponer para ser llamada
