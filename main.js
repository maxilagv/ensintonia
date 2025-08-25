// Importar módulos de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

// Variable global para almacenar los intervalos de animación de las categorías
let categoryAnimationIntervals = {};

/**
 * @function checkAndHideMainLoader
 * @description Verifica si todas las cargas iniciales (categorías y productos) han finalizado
 * y oculta el loader principal si es así.
 */
function checkAndHideMainLoader() {
    console.log("checkAndHideMainLoader - called."); // Log de inicio
    console.log("checkAndHideMainLoader - categoriesInitialLoadComplete:", categoriesInitialLoadComplete);
    console.log("checkAndHideMainLoader - productsInitialLoadComplete:", productsInitialLoadComplete);

    if (categoriesInitialLoadComplete && productsInitialLoadComplete) {
        console.log("checkAndHideMainLoader - Ambas cargas iniciales completas. Ocultando loader futurista.");
        hideLoading('futuristic-loader');
    } else {
        console.log("checkAndHideMainLoader - Esperando a que todas las cargas iniciales se completen.");
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
            loader.style.opacity = '0'; // Inicia la transición
            loader.style.pointerEvents = 'none'; // Deshabilita los eventos del puntero inmediatamente
            console.log("hideLoading - Futuristic loader: opacity set to 0, pointer-events set to none.");

            // Eliminar el elemento del DOM después de la transición
            setTimeout(() => {
                loader.classList.add('hidden'); // Añade la clase 'hidden' después de la transición
                // loader.remove(); // Elimina el loader del DOM después de la transición
                document.body.style.overflow = ''; // Restaura el scroll
                console.log("hideLoading - Futuristic loader: 'hidden' class added after timeout.");
            }, 500); // 500ms coincide con la duración de la transición CSS
        } else {
            loader.classList.add('hidden');
        }
    }
}

/**
 * @function loadCategories
 * @description Carga las categorías desde Firestore en tiempo real y las renderiza en la página
 * y en el submenú de categorías del menú móvil. También carga una muestra de imágenes de productos
 * para cada categoría para la animación.
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

    onSnapshot(categoriesCol, async (snapshot) => { // Hacer la función de callback async
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
            const categoryPromises = snapshot.docs.map(async doc => { // Procesar cada categoría asíncronamente
                const category = { id: doc.id, ...doc.data() };

                // Realizar una sub-consulta para obtener hasta 3 imágenes de productos de esta categoría
                const productsForCategoryQuery = query(
                    collection(db, `artifacts/${appId}/public/data/products`),
                    where("category", "==", category.name),
                    limit(3) // Revertido a 3 para la animación
                );
                const productsSnapshot = await getDocs(productsForCategoryQuery);
                
                // Recolectar URLs de imágenes de productos, filtrando las nulas/vacías
                // y asegurándose de no incluir la imagen principal de la categoría si ya está en los productos
                const productImages = productsSnapshot.docs
                    .map(pDoc => pDoc.data().imageUrl)
                    .filter(url => url && url !== category.imageUrl);

                // Si la categoría tiene una imagen principal, la añadimos al inicio de la lista
                if (category.imageUrl) {
                    productImages.unshift(category.imageUrl);
                }
                
                // Asegurarse de que productImages no esté vacío si hay imageUrl de categoría
                if (productImages.length === 0 && category.imageUrl) {
                    productImages.push(category.imageUrl);
                }

                category.productImages = productImages;
                categoriesData.push(category);
                return category;
            });

            // Esperar a que todas las sub-consultas de imágenes de productos se completen
            const loadedCategories = await Promise.all(categoryPromises);

            loadedCategories.forEach(category => {
                // Crear el elemento de la tarjeta de categoría
                const categoryCardDiv = document.createElement('div');
                categoryCardDiv.className = "product-card bg-white rounded-xl shadow-xl overflow-hidden cursor-pointer";
                categoryCardDiv.setAttribute('onclick', `goToCategory('${category.name}')`);
                categoryCardDiv.setAttribute('data-category-name', category.name);
                categoryCardDiv.setAttribute('data-original-image', category.imageUrl || 'https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen');
                categoryCardDiv.setAttribute('data-product-images', JSON.stringify(category.productImages));

                // Rellenar el contenido HTML de la tarjeta
                // La imagen tiene un onclick para abrir el modal de zoom
                categoryCardDiv.innerHTML = `
                    <img src="${category.imageUrl || 'https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen'}"
                         alt="${category.name}"
                         class="w-full h-48 object-cover transition duration-300 ease-in-out transform hover:scale-105 category-image-animated">
                    <div class="p-6 sm:p-7">
                        <h3 class="text-2xl sm:text-3xl font-semibold mb-2 sm:mb-3 text-gray-900">${category.name}</h3>
                        <p class="text-base sm:text-lg text-gray-700 mb-4 sm:mb-5">${category.description || 'Descripción no disponible.'}</p>
                        <button class="btn-primary text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg w-full">Ver Categoría</button>
                    </div>
                `;
                
                // Añadir listeners directamente a la tarjeta creada para la animación en PC
                categoryCardDiv.addEventListener('mouseenter', () => startCategoryImageAnimation(categoryCardDiv));
                // Corrección aquí: Pasar 'categoryCardDiv' directamente para asegurar que esté definido
                categoryCardDiv.addEventListener('mouseleave', () => stopCategoryImageAnimation(categoryCardDiv));

                categoriesContainer.appendChild(categoryCardDiv);

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
                    if (videoUrl && videoUrl.trim() !== '') { // Asegurarse de que videoUrl no sea una cadena vacía
                        // Regex para YouTube (videos normales, shorts, embeds)
                        const youtubeMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)(?:\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})(?:\S+)?/);
                        // Regex para TikTok
                        const tiktokMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.]+\/video\/(\d+)/);
                        // Regex para Streamable (existente)
                        const streamableMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?streamable\.com\/([\w-]+)(?:\S+)?/);

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
                                        onerror="console.error('Error al cargar iframe de YouTube para el producto ${name}', this); this.src='https://placehold.co/600x400/cccccc/333333?text=Error+Video+YT';"
                                    ></iframe>
                                </div>
                            `;
                            console.log("loadAllProducts - Usando iframe de YouTube para producto", name, ". URL:", embedUrl);
                        } else if (tiktokMatch && tiktokMatch[1]) { // Nuevo: Si es TikTok
                            const embedUrl = `https://www.tiktok.com/embed/${tiktokMatch[1]}`;
                            mediaHtml = `
                                <div class="relative w-full" style="padding-bottom: 56.25%;"> <!-- 16:9 Aspect Ratio (ajustar si TikTok tiene otro aspect ratio preferente) -->
                                    <iframe
                                        class="absolute top-0 left-0 w-full h-full rounded-t-xl"
                                        src="${embedUrl}"
                                        frameborder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowfullscreen
                                        onerror="console.error('Error al cargar iframe de TikTok para el producto ${name}', this); this.src='https://placehold.co/600x400/cccccc/333333?text=Error+Video+TikTok';"
                                    ></iframe>
                                </div>
                            `;
                            console.log("loadAllProducts - Usando iframe de TikTok para producto", name, ". URL:", embedUrl);
                        } else if (streamableMatch && streamableMatch[1]) { // Existente: Si es Streamable
                            const embedUrl = `https://streamable.com/e/${streamableMatch[1]}?autoplay=0&controls=1&muted=1&loop=0`; // Streamable embed URL
                            mediaHtml = `
                                <div class="relative w-full" style="padding-bottom: 56.25%;"> <!-- 16:9 Aspect Ratio -->
                                    <iframe
                                        class="absolute top-0 left-0 w-full h-full rounded-t-xl"
                                        src="${embedUrl}"
                                        frameborder="0"
                                        allow="autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowfullscreen
                                        onerror="console.error('Error al cargar iframe de Streamable para el producto ${name}', this); this.src='https://placehold.co/600x400/cccccc/333333?text=Error+Video+Streamable';"
                                    ></iframe>
                                </div>
                            `;
                            console.log("loadAllProducts - Usando iframe de Streamable para producto", name, ". URL:", embedUrl);
                        }
                        else {
                            // Si no coincide con ninguna plataforma conocida, asumimos que es un video directo (ej. .mp4)
                            mediaHtml = `
                                <video 
                                    class="w-full h-48 object-cover rounded-t-xl" 
                                    controls 
                                    muted 
                                    loop 
                                    playsinline
                                    onerror="console.error('Error al cargar video directo para el producto ${name}', this); this.parentNode.innerHTML='<img src=\\'https://placehold.co/600x400/cccccc/333333?text=Error+Video\\' alt=\\'Error de video\\' class=\\'w-full h-48 object-cover rounded-t-xl\\'>';"
                                >
                                    <source src="${videoUrl}" type="video/mp4">
                                    Tu navegador no soporta el tag de video.
                                </video>
                            `;
                            console.log("loadAllProducts - Usando video directo para producto", name, ". URL:", videoUrl);
                        }
                    } else if (imageUrl) {
                        // Se agrega un marcador de posición para la URL de la imagen que usaremos en el event listener
                        mediaHtml = `<img src="${imageUrl}" alt="${name}" class="w-full h-48 object-cover rounded-t-xl cursor-pointer product-image" data-full-image-url="${imageUrl}" data-alt-text="${name}" onerror="this.onerror=null;this.src='https://placehold.co/600x400/cccccc/333333?text=Imagen+No+Cargada';">`;
                    } else {
                        mediaHtml = `<img src="https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen" alt="Sin imagen" class="w-full h-48 object-cover rounded-t-xl">`;
                    }

                    let componentsButtonHtml = '';
                    if (componentsUrl) {
                        componentsButtonHtml = `
                            <a href="${componentsUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg w-full mt-4 flex items-center justify-center">
                                <i class="fas fa-microchip mr-2"></i> Ver Componentes
                            </a>
                        `;
                    }

                    const productCardDiv = document.createElement('div');
                    productCardDiv.className = "product-card bg-white rounded-xl shadow-lg overflow-hidden flex flex-col";
                    productCardDiv.innerHTML = `
                        ${mediaHtml}
                        <div class="p-4 flex flex-col flex-grow">
                            <h3 class="text-lg font-semibold text-gray-800">${name}</h3>
                            <p class="text-gray-600 text-sm mt-1 flex-grow">${description || ''}</p>
                            <p class="text-blue-600 font-bold mt-2">$${price ? price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}</p>
                            ${componentsButtonHtml}
                        </div>
                    `;
                    productContainer.appendChild(productCardDiv);

                    // Añadir el event listener a la imagen si existe
                    const productImage = productCardDiv.querySelector('.product-image');
                    if (productImage) {
                        productImage.addEventListener('click', (event) => {
                            const fullImageUrl = event.target.dataset.fullImageUrl;
                            const altText = event.target.dataset.altText;
                            if (fullImageUrl) {
                                openFullscreenImage(fullImageUrl, altText);
                            }
                        });
                    }
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
                    if (videoUrl && videoUrl.trim() !== '') { // Asegurarse de que videoUrl no sea una cadena vacía
                        // Regex para YouTube (videos normales, shorts, embeds)
                        const youtubeMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)(?:\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})(?:\S+)?/);
                        // Regex para TikTok
                        const tiktokMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.]+\/video\/(\d+)/);
                        // Regex para Streamable (existente)
                        const streamableMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?streamable\.com\/([\w-]+)(?:\S+)?/);

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
                                        onerror="console.error('Error al cargar iframe de YouTube para el producto ${name}', this); this.src='https://placehold.co/600x400/cccccc/333333?text=Error+Video+YT';"
                                    ></iframe>
                                </div>
                            `;
                            console.log("loadProductsByCategory - Usando iframe de YouTube para producto", name, ". URL:", embedUrl);
                        } else if (tiktokMatch && tiktokMatch[1]) { // Nuevo: Si es TikTok
                            const embedUrl = `https://www.tiktok.com/embed/${tiktokMatch[1]}`;
                            mediaHtml = `
                                <div class="relative w-full" style="padding-bottom: 56.25%;"> <!-- 16:9 Aspect Ratio (ajustar si TikTok tiene otro aspect ratio preferente) -->
                                    <iframe
                                        class="absolute top-0 left-0 w-full h-full rounded-t-xl"
                                        src="${embedUrl}"
                                        frameborder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowfullscreen
                                        onerror="console.error('Error al cargar iframe de TikTok para el producto ${name}', this); this.src='https://placehold.co/600x400/cccccc/333333?text=Error+Video+TikTok';"
                                    ></iframe>
                                </div>
                            `;
                            console.log("loadProductsByCategory - Usando iframe de TikTok para producto", name, ". URL:", embedUrl);
                        } else if (streamableMatch && streamableMatch[1]) { // Existente: Si es Streamable
                            const embedUrl = `https://streamable.com/e/${streamableMatch[1]}?autoplay=0&controls=1&muted=1&loop=0`; // Streamable embed URL
                            mediaHtml = `
                                <div class="relative w-full" style="padding-bottom: 56.25%;"> <!-- 16:9 Aspect Ratio -->
                                    <iframe
                                        class="absolute top-0 left-0 w-full h-full rounded-t-xl"
                                        src="${embedUrl}"
                                        frameborder="0"
                                        allow="autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowfullscreen
                                        onerror="console.error('Error al cargar iframe de Streamable para el producto ${name}', this); this.src='https://placehold.co/600x400/cccccc/333333?text=Error+Video+Streamable';"
                                    ></iframe>
                                </div>
                            `;
                            console.log("loadProductsByCategory - Usando iframe de Streamable para producto", name, ". URL:", embedUrl);
                        }
                        else {
                            // Si no coincide con ninguna plataforma conocida, asumimos que es un video directo (ej. .mp4)
                            mediaHtml = `
                                <video 
                                    class="w-full h-48 object-cover rounded-t-xl" 
                                    controls 
                                    muted 
                                    loop 
                                    playsinline
                                    onerror="console.error('Error al cargar video directo para el producto ${name}', this); this.parentNode.innerHTML='<img src=\\'https://placehold.co/600x400/cccccc/333333?text=Error+Video\\' alt=\\'Error de video\\' class=\\'w-full h-48 object-cover rounded-t-xl\\'>';"
                                >
                                    <source src="${videoUrl}" type="video/mp4">
                                    Tu navegador no soporta el tag de video.
                                </video>
                            `;
                            console.log("loadProductsByCategory - Usando video directo para producto", name, ". URL:", videoUrl);
                        }
                    } else if (imageUrl) {
                        // Se agrega un marcador de posición para la URL de la imagen que usaremos en el event listener
                        mediaHtml = `<img src="${imageUrl}" alt="${name}" class="w-full h-48 object-cover rounded-t-xl cursor-pointer product-image" data-full-image-url="${imageUrl}" data-alt-text="${name}" onerror="this.onerror=null;this.src='https://placehold.co/600x400/cccccc/333333?text=Imagen+No+Cargada';">`;
                    } else {
                        mediaHtml = `<img src="https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen" alt="Sin imagen" class="w-full h-48 object-cover rounded-t-xl">`;
                    }

                    let componentsButtonHtml = '';
                    if (componentsUrl) {
                        componentsButtonHtml = `
                            <a href="${componentsUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg w-full mt-4 flex items-center justify-center">
                                <i class="fas fa-microchip mr-2"></i> Ver Componentes
                            </a>
                        `;
                    }

                    const productCardDiv = document.createElement('div');
                    productCardDiv.className = "product-card bg-white rounded-xl shadow-lg overflow-hidden flex flex-col";
                    productCardDiv.innerHTML = `
                        ${mediaHtml}
                        <div class="p-4 flex flex-col flex-grow">
                            <h3 class="text-lg font-semibold text-gray-800">${name}</h3>
                            <p class="text-gray-600 text-sm mt-1 flex-grow">${description || ''}</p>
                            <p class="text-blue-600 font-bold mt-2">$${price ? price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}</p>
                            ${componentsButtonHtml}
                        </div>
                    `;
                    productContainer.appendChild(productCardDiv);

                    // Añadir el event listener a la imagen si existe
                    const productImage = productCardDiv.querySelector('.product-image');
                    if (productImage) {
                        productImage.addEventListener('click', (event) => {
                            const fullImageUrl = event.target.dataset.fullImageUrl;
                            const altText = event.target.dataset.altText;
                            if (fullImageUrl) {
                                openFullscreenImage(fullImageUrl, altText);
                            }
                        });
                    }
                });
            }
            hideLoading('products-loading-spinner'); // Oculta el loader de productos
            productsInitialLoadComplete = true; // Marcar productos como cargados
            checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
        }, (error) => {
            console.error("loadProductsByCategory - Error al cargar productos por categoría:", error);
            showMessageBox("Error al cargar productos por categoría. Inténtalo más tarde.");
            hideLoading('products-loading-spinner'); // Oculta el loader de productos incluso si hay un error
            const existingMessageBox = document.querySelector('.message-box-autodismiss');
            if (existingMessageBox) {
                existingMessageBox.remove();
            }
        });
    } catch (error) {
        console.error("loadProductsByCategory - Error al configurar listener de productos por categoría:", error);
        showMessageBox("Error al cargar productos por categoría. Inténtalo más tarde.");
        hideLoading('products-loading-spinner'); // Oculta el loader de productos
        const existingMessageBox = document.querySelector('.message-box-autodismiss');
        if (existingMessageBox) {
            existingMessageBox.remove();
        }
    }
}

/**
 * @function showMessageBox
 * @description Muestra un cuadro de mensaje personalizado en lugar de la alerta del navegador.
 * @param {string} message - El mensaje a mostrar.
 * @param {number} [duration] - Duración en milisegundos para que el mensaje se cierre automáticamente.
 * @returns {HTMLElement} El elemento del messageBox creado.
 */
function showMessageBox(message, duration = null) {
    const messageBox = document.createElement('div');
    messageBox.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    messageBox.innerHTML = `
        <div class="bg-white p-8 rounded-lg shadow-xl text-center max-w-sm mx-auto flex flex-col items-center">
            <p class="text-xl font-semibold text-gray-800 mb-4">${message}</p>
            ${duration === null ? '<button onclick="this.parentNode.parentNode.remove()" class="btn-primary text-white font-bold py-2 px-5 rounded-md">Cerrar</button>' : ''}
            ${duration !== null ? '<div class="loader-circle border-t-2 border-b-2 border-blue-500 rounded-full w-8 h-8 animate-spin mt-4"></div>' : ''}
        </div>
    `;
    document.body.appendChild(messageBox);

    if (duration !== null) {
        // Añadir una clase para identificar el messageBox que se autodismisirá
        messageBox.classList.add('message-box-autodismiss');
        setTimeout(() => {
            if (messageBox.parentNode) { // Asegurarse de que el elemento todavía existe
                messageBox.remove();
            }
        }, duration);
    }

    return messageBox; // Retorna el elemento para poder manipularlo si es necesario
}

/**
 * @function goToCategory
 * @description Maneja la navegación a una categoría específica y carga sus productos.
 * @param {string} categoryName - El nombre de la categoría a la que navegar.
 */
function goToCategory(categoryName) {
    // Mostrar un mensaje de carga que se autodismisirá después de 1 segundo (1000 milisegundos).
    showMessageBox(`Cargando productos de la categoría: ${categoryName}...`, 1000); 

    loadProductsByCategory(categoryName); // Cargar los productos de la categoría
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

/**
 * @function openFullscreenImage
 * @description Abre un modal para mostrar la imagen del producto en pantalla completa.
 * @param {string} imageUrl - La URL de la imagen a mostrar.
 * @param {string} altText - El texto alternativo para la imagen.
 */
window.openFullscreenImage = function(imageUrl, altText) {
    console.log("openFullscreenImage - Llamada. URL:", imageUrl, "Alt:", altText); // Log de la llamada
    const modal = document.getElementById('image-fullscreen-modal');
    const image = document.getElementById('fullscreen-image');

    // **VERIFICACIÓN CRÍTICA**: Asegurarse de que el modal y la imagen existen en el DOM
    if (!modal || !image) {
        console.error("openFullscreenImage - Error: Elementos del modal de zoom no encontrados en el DOM.");
        showMessageBox("No se pudo iniciar el zoom. Por favor, asegúrate de que el modal de imagen esté presente en la página.");
        return; // Salir de la función si los elementos no existen
    }

    // Limpiar cualquier manejador de errores anterior y atributo src para una carga limpia
    image.onerror = null;
    image.src = ''; 
    image.alt = '';

    // Configurar el manejador de errores antes de establecer el src
    image.onerror = function() {
        console.error("openFullscreenImage - Error al cargar la imagen en pantalla completa:", imageUrl);
        image.src = 'https://placehold.co/600x400/FF0000/FFFFFF?text=Error+Carga+Imagen'; // Imagen de fallback
        image.alt = 'Error al cargar la imagen';
        showMessageBox("No se pudo cargar la imagen en pantalla completa. Por favor, inténtalo de nuevo.");
    };

    image.src = imageUrl;
    image.alt = altText;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden'; // Evita el scroll del cuerpo
}

/**
 * @function closeFullscreenImage
 * @description Cierra el modal de imagen en pantalla completa.
 */
window.closeFullscreenImage = function() {
    console.log("closeFullscreenImage - Llamada."); // Log de la llamada
    const modal = document.getElementById('image-fullscreen-modal');
    const image = document.getElementById('fullscreen-image'); // Necesitamos obtener la referencia de la imagen aquí también

    // **VERIFICACIÓN CRÍTICA**: Asegurarse de que el modal y la imagen existen en el DOM
    if (!modal || !image) {
        console.error("closeFullscreenImage - Error: Elementos del modal de zoom no encontrados en el DOM.");
        return; // Salir de la función si los elementos no existen
    }

    modal.classList.remove('open');
    document.body.style.overflow = ''; // Restaura el scroll del cuerpo

    // Limpiar la imagen y su manejador de errores para liberar recursos
    image.src = ''; // Vaciar el src para asegurar una carga limpia la próxima vez
    image.onerror = null;
}

/**
 * @function startCategoryImageAnimation
 * @description Inicia la animación de cambio de imagen para una tarjeta de categoría al pasar el ratón.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta de categoría.
 */
function startCategoryImageAnimation(cardElement) {
    const imgElement = cardElement.querySelector('.category-image-animated');
    if (!imgElement) return;

    const originalImageUrl = cardElement.dataset.originalImage;
    const productImages = JSON.parse(cardElement.dataset.productImages || '[]');

    // Si no hay suficientes imágenes para animar (menos de 2), no hacer nada.
    if (productImages.length <= 1) {
        // Asegurarse de que el intervalo si existía, se limpie y se elimine
        stopCategoryImageAnimation(cardElement);
        return;
    }

    // Limpiar cualquier intervalo existente para esta tarjeta
    stopCategoryImageAnimation(cardElement);

    let currentIndex = productImages.indexOf(imgElement.src);
    if (currentIndex === -1 || currentIndex >= productImages.length - 1) {
        currentIndex = -1; // Si la imagen actual no está en la lista o es la última, empezar desde el principio
    }

    const intervalId = setInterval(() => {
        currentIndex = (currentIndex + 1) % productImages.length;
        // Aplicar un efecto de desvanecimiento sutil
        imgElement.style.opacity = '0';
        setTimeout(() => {
            imgElement.src = productImages[currentIndex];
            imgElement.style.opacity = '1';
        }, 300); // 300ms coincide con la duración de la transición CSS
    }, 2000); // Cambiar imagen cada 2 segundos

    categoryAnimationIntervals[cardElement.dataset.categoryName] = intervalId;
}

/**
 * @function stopCategoryImageAnimation
 * @description Detiene la animación de cambio de imagen para una tarjeta de categoría.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta de categoría.
 */
function stopCategoryImageAnimation(cardElement) {
    const categoryName = cardElement.dataset.categoryName;
    if (categoryAnimationIntervals[categoryName]) {
        clearInterval(categoryAnimationIntervals[categoryName]);
        delete categoryAnimationIntervals[categoryName];

        const imgElement = cardElement.querySelector('.category-image-animated');
        if (imgElement) {
            // Revertir la imagen a la original con un desvanecimiento
            imgElement.style.opacity = '0';
            setTimeout(() => {
                imgElement.src = cardElement.dataset.originalImage;
                imgElement.style.opacity = '1';
            }, 300);
        }
    }
}


// Lógica para el menú de hamburguesa y submenús
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOMContentLoaded - DOM completamente cargado."); // Log de DOMContentLoaded
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileNav = document.getElementById('mobile-nav');
    const categoriesToggleButton = document.getElementById('categories-toggle-button');
    const closeImageModalButton = document.getElementById('close-image-modal');
    const imageFullscreenModal = document.getElementById('image-fullscreen-modal');


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

    // Cerrar modal de imagen al hacer clic en el botón de cerrar
    if (closeImageModalButton) {
        closeImageModalButton.addEventListener('click', window.closeFullscreenImage); // Usar window.closeFullscreenImage
    }

    // Cerrar modal de imagen al hacer clic fuera de la imagen (en el overlay)
    if (imageFullscreenModal) {
        imageFullscreenModal.addEventListener('click', function(event) {
            if (event.target === imageFullscreenModal) { // Solo si el click es directamente en el overlay
                window.closeFullscreenImage(); // Usar window.closeFullscreenImage
            }
        });
    }

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

    // --- Lógica para animaciones de imágenes de categoría (para dispositivos táctiles) ---
    const categoriesContainer = document.getElementById('categories-container');
    if (categoriesContainer) {
        // Para dispositivos táctiles: un toque inicia, otro lo detiene o click fuera
        categoriesContainer.addEventListener('touchstart', (event) => {
            const card = event.target.closest('.product-card');
            if (card) {
                // Detener animaciones de otras tarjetas activas
                for (const key in categoryAnimationIntervals) {
                    if (key !== card.dataset.categoryName) {
                        const otherCard = document.querySelector(`[data-category-name="${key}"]`);
                        if (otherCard) stopCategoryImageAnimation(otherCard);
                    }
                }
                // Alternar animación para la tarjeta tocada
                if (categoryAnimationIntervals[card.dataset.categoryName]) {
                    stopCategoryImageAnimation(card);
                } else {
                    startCategoryImageAnimation(card);
                }
            }
        });

        // Listener global para detener la animación si se hace clic fuera de una tarjeta activa
        document.body.addEventListener('click', (event) => {
            const card = event.target.closest('.product-card');
            if (!card && Object.keys(categoryAnimationIntervals).length > 0) {
                for (const key in categoryAnimationIntervals) {
                    const activeCard = document.querySelector(`[data-category-name="${key}"]`);
                    if (activeCard) stopCategoryImageAnimation(activeCard);
                }
            }
        });
    }
    // --- Fin de la lógica para animaciones de imágenes de categoría ---
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
window.openFullscreenImage = openFullscreenImage; // Exponer para abrir imágenes en pantalla completa
window.closeFullscreenImage = closeFullscreenImage; // Exponer para cerrar imágenes en pantalla completa
window.startCategoryImageAnimation = startCategoryImageAnimation; // Exponer la función de animación de categoría
window.stopCategoryImageAnimation = stopCategoryImageAnimation;   // Exponer la función de detener animación de categoría

