// Importaciones de Firebase
import { db, auth } from './firebaseconfig.js';
// Corrección: Asegurarse de importar signInWithCustomToken y signInAnonymously
import { onAuthStateChanged, signOut, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, getDoc, doc, updateDoc, deleteDoc, query, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let userId = null;
let isAuthReady = false;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'; // Asegurar que appId está definido

/**
 * @function showMessageBox
 * @description Muestra un cuadro de mensaje personalizado.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} type - 'success', 'error', 'warning' para estilos visuales.
 */
function showMessageBox(message, type = 'info') {
    const messageBoxContainer = document.getElementById('message-box-container');
    if (!messageBoxContainer) {
        console.error("No se encontró el contenedor de la caja de mensajes.");
        // Considerar un fallback o log de error más robusto si este contenedor es crítico
        return;
    }

    const existingOverlay = messageBoxContainer.querySelector('.message-box-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'message-box-overlay';

    const messageBoxContent = document.createElement('div');
    messageBoxContent.className = 'message-box-content';

    let bgColorClass = 'bg-blue-500';
    let iconHtml = '';

    switch (type) {
        case 'success':
            bgColorClass = 'bg-green-600';
            iconHtml = '<i class="fas fa-check-circle text-3xl mb-3"></i>';
            break;
        case 'error':
            bgColorClass = 'bg-red-600';
            iconHtml = '<i class="fas fa-times-circle text-3xl mb-3"></i>';
            break;
        case 'warning':
            bgColorClass = 'bg-yellow-600';
            iconHtml = '<i class="fas fa-exclamation-triangle text-3xl mb-3"></i>';
            break;
        case 'info':
        default:
            bgColorClass = 'bg-blue-600';
            iconHtml = '<i class="fas fa-info-circle text-3xl mb-3"></i>';
            break;
    }

    messageBoxContent.innerHTML = `
        <div class="p-6 rounded-lg shadow-xl text-center ${bgColorClass}">
            ${iconHtml}
            <p class="text-xl font-semibold mb-4 text-white">${message}</p>
            <button onclick="this.parentNode.parentNode.parentNode.remove()" class="bg-white text-gray-800 font-bold py-2 px-5 rounded-md mt-4 hover:bg-gray-100 transition">Cerrar</button>
        </div>
    `;

    overlay.appendChild(messageBoxContent);
    messageBoxContainer.appendChild(overlay);

    // Activar la animación de entrada
    setTimeout(() => {
        overlay.classList.add('show');
    }, 10);

    // Ocultar automáticamente después de 3 segundos (excepto para errores que deben ser cerrados manualmente)
    if (type !== 'error') {
        setTimeout(() => {
            if (overlay) {
                overlay.classList.remove('show');
                overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
            }
        }, 3000);
    }
}


/**
 * @function initFirebaseAndAuth
 * @description Inicializa la aplicación Firebase y configura la autenticación para el panel de administración.
 */
async function initFirebaseAndAuth() {
    console.log("Admin Panel - Iniciando inicialización de Firebase y autenticación...");
    // El 'app' ya está inicializado en firebaseconfig.js, solo necesitamos configurar la autenticación.
    
    // Iniciar sesión con token personalizado si está disponible, de lo contrario, de forma anónima
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    if (initialAuthToken) {
        console.log("Admin Panel - Intentando iniciar sesión con token personalizado.");
        try {
            await signInWithCustomToken(auth, initialAuthToken);
        } catch (error) {
            console.error("Admin Panel - Error al iniciar sesión con token personalizado:", error);
            showMessageBox("Error de autenticación. Intentando inicio de sesión anónimo.", 'error');
            await signInAnonymously(auth); // Fallback a anónimo
        }
    } else {
        console.log("Admin Panel - Intentando iniciar sesión anónimamente.");
        await signInAnonymously(auth);
    }

    // Escuchar cambios en el estado de autenticación
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            isAuthReady = true;
            console.log("Admin Panel - Usuario autenticado. ID de Usuario:", userId);
            // Una vez autenticado, cargar los datos iniciales para los formularios
            loadCategoriesForEdit();
            loadProductsForEdit();
            loadCategoriesForProductForms(); // Para los select de productos
        } else {
            // Si el usuario no está autenticado, redirigir a la página de login
            console.warn("Admin Panel - No hay sesión activa en Firebase. Redirigiendo a login.html.");
            localStorage.removeItem('loggedIn'); // Asegurarse de limpiar el estado local
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 500); // Pequeño retraso para que el mensaje se vea
        }
    });
}


// Referencias a colecciones de Firestore (públicas para este ejemplo de admin)
const categoriesCollectionRef = collection(db, `artifacts/${appId}/public/data/categories`);
const productsCollectionRef = collection(db, `artifacts/${appId}/public/data/products`);

const navButtons = document.querySelectorAll('.nav-button');
const sections = document.querySelectorAll('.section-content');
const logoutButton = document.getElementById('logoutButton');

const createCategoryForm = document.getElementById('createCategoryForm');
const editCategorySection = document.getElementById('editCategory');
const selectCategoryToEdit = document.getElementById('selectCategoryToEdit');
const editedCategoryNameInput = document.getElementById('editedCategoryName');
const editedCategoryImageUrlInput = document.getElementById('editedCategoryImageUrl');
const saveCategoryChangesButton = editCategorySection.querySelector('.action-button');

const createProductForm = document.getElementById('createProductForm');
const productCategorySelect = document.getElementById('productCategory'); // Select en crear producto

const editProductSection = document.getElementById('editProduct');
const selectProductToEdit = document.getElementById('selectProductToEdit');
const editedProductNameInput = document.getElementById('editedProductName');
const editedProductPriceInput = document.getElementById('editedProductPrice');
const editedProductImageUrlInput = document.getElementById('editedProductImageUrl');
const editedProductCategorySelect = document.getElementById('editedProductCategory'); // Select en editar producto
const editedProductDescriptionInput = document.getElementById('editedProductDescription');
const editedProductComponentsUrlInput = document.getElementById('editedProductComponentsUrl'); // Nuevo campo
const editedProductVideoUrlInput = document.getElementById('editedProductVideoUrl'); // Nuevo campo
const saveProductChangesButton = editProductSection.querySelector('.action-button');


// Función para cambiar de sección
function showSection(sectionId) {
    sections.forEach(section => {
        section.classList.add('hidden');
    });
    document.getElementById(sectionId).classList.remove('hidden');

    navButtons.forEach(button => {
        button.classList.remove('active');
    });
    const activeButton = document.querySelector(`.nav-button[data-section="${sectionId}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // Recargar listas de categorías/productos al cambiar a sus secciones
    if (sectionId === 'editCategory') {
        loadCategoriesForEdit();
    } else if (sectionId === 'createProduct' || sectionId === 'editProduct') {
        loadCategoriesForProductForms();
        if (sectionId === 'editProduct') {
            loadProductsForEdit();
        }
    }
}

// --- Funciones para Categorías ---
async function loadCategoriesForEdit() {
    if (!isAuthReady) {
        console.log("loadCategoriesForEdit: Firebase no está autenticado aún.");
        return;
    }
    selectCategoryToEdit.innerHTML = '<option value="">-- Selecciona una categoría --</option>';
    try {
        console.log("loadCategoriesForEdit: Cargando categorías para edición...");
        const querySnapshot = await getDocs(categoriesCollectionRef);
        querySnapshot.forEach((doc) => {
            const category = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = category.name;
            selectCategoryToEdit.appendChild(option);
        });
        console.log("loadCategoriesForEdit: Categorías cargadas exitosamente.");
    } catch (error) {
        console.error("loadCategoriesForEdit: Error al cargar categorías:", error);
        showMessageBox("Error al cargar categorías.", "error");
    }
}

async function populateCategoryEditForm(categoryId) {
    if (!isAuthReady || !categoryId) {
        editedCategoryNameInput.value = '';
        editedCategoryImageUrlInput.value = '';
        return;
    }
    try {
        console.log("populateCategoryEditForm: Cargando datos para categoría ID:", categoryId);
        const categoryDocRef = doc(db, `artifacts/${appId}/public/data/categories`, categoryId);
        const docSnap = await getDoc(categoryDocRef); 
        
        if (docSnap.exists()) {
            const categoryData = docSnap.data();
            editedCategoryNameInput.value = categoryData.name;
            editedCategoryImageUrlInput.value = categoryData.imageUrl;
            console.log("populateCategoryEditForm: Datos de categoría cargados:", categoryData);
        } else {
            console.log("populateCategoryEditForm: Categoría no encontrada para ID:", categoryId);
            showMessageBox("Categoría no encontrada.", "error");
        }
    } catch (error) {
        console.error("populateCategoryEditForm: Error al cargar datos de la categoría:", error);
        showMessageBox("Error al cargar datos de la categoría.", "error");
    }
}

async function updateCategoryInFirestore(categoryId, newName, newImageUrl) {
    if (!db || !userId) {
        showMessageBox("Error: Firebase o usuario no autenticado. No se puede actualizar la categoría.", 'error');
        return;
    }
    try {
        const categoryDocRef = doc(db, `artifacts/${appId}/public/data/categories`, categoryId);
        await updateDoc(categoryDocRef, {
            name: newName,
            imageUrl: newImageUrl
        });
        showMessageBox(`Categoría "${newName}" actualizada exitosamente.`, 'success');
        loadCategoriesForEdit();
        loadCategoriesForProductForms(); // Recargar también los selects de productos
        populateCategoryEditForm(''); // Limpiar formulario de edición
    } catch (error) {
        console.error("Error al actualizar la categoría:", error);
        showMessageBox("Error al actualizar la categoría. Inténtalo de nuevo.", 'error');
    }
}

async function deleteCategoryFromFirestore(categoryId) {
    if (!db || !userId) {
        showMessageBox("Error: Firebase o usuario no autenticado. No se puede eliminar la categoría.", 'error');
        return;
    }
    // Implementar confirmación personalizada en lugar de window.confirm
    const confirmDelete = await new Promise(resolve => {
        showMessageBox("¿Estás seguro de que quieres eliminar esta categoría? Esto eliminará también los productos asociados.", 'warning');
        // Aquí podrías añadir botones de "Confirmar" y "Cancelar" en showMessageBox
        // Por simplicidad, se asume que showMessageBox puede manejar esto o se usa un confirm personalizado.
        // Para este ejemplo, si la caja de mensaje es solo informativa, la confirmación debe ser manejada de otra forma.
        // Usaremos window.confirm por ahora para la funcionalidad.
        resolve(window.confirm("¿Estás seguro de que quieres eliminar esta categoría? Esto eliminará también los productos asociados."));
    });


    if (confirmDelete) {
        try {
            const categoryDocRef = doc(db, `artifacts/${appId}/public/data/categories`, categoryId);
            await deleteDoc(categoryDocRef);
            showMessageBox("Categoría eliminada exitosamente.", 'success');
            loadCategoriesForEdit();
            loadCategoriesForProductForms(); // Recargar también los selects de productos
            populateCategoryEditForm('');
        } catch (error) {
            console.error("Error al eliminar la categoría:", error);
            showMessageBox("Error al eliminar la categoría. Inténtalo de nuevo.", 'error');
        }
    }
}


// --- Funciones para Productos ---
async function loadCategoriesForProductForms() {
    if (!isAuthReady) {
        console.log("loadCategoriesForProductForms: Firebase no está autenticado aún.");
        return;
    }
    // Limpiar y añadir la opción por defecto en ambos selects de categoría para productos
    productCategorySelect.innerHTML = '<option value="">-- Selecciona una categoría --</option>';
    editedProductCategorySelect.innerHTML = '<option value="">-- Selecciona una categoría --</option>';

    try {
        console.log("loadCategoriesForProductForms: Cargando categorías para formularios de productos...");
        const querySnapshot = await getDocs(categoriesCollectionRef);
        
        if (querySnapshot.empty) {
            console.log("loadCategoriesForProductForms: No hay categorías en Firestore. Los selectores de categorías permanecerán vacíos.");
            // Mensaje explícito en el selector si no hay categorías
            productCategorySelect.innerHTML = '<option value="" disabled>-- No hay categorías (crea una primero) --</option>';
            editedProductCategorySelect.innerHTML = '<option value="" disabled>-- No hay categorías (crea una primero) --</option>';
        } else {
            querySnapshot.forEach((doc) => {
                const category = doc.data();
                // Añadir al select de Crear Producto
                let optionCreate = document.createElement('option');
                optionCreate.value = category.name; // Usamos el nombre de la categoría como valor
                optionCreate.textContent = category.name;
                productCategorySelect.appendChild(optionCreate);

                // Añadir al select de Editar Producto
                let optionEdit = document.createElement('option');
                optionEdit.value = category.name; // Usamos el nombre de la categoría como valor
                optionEdit.textContent = category.name;
                editedProductCategorySelect.appendChild(optionEdit);
            });
            console.log("loadCategoriesForProductForms: Categorías cargadas exitosamente para formularios de productos.");
        }
    } catch (error) {
        console.error("loadCategoriesForProductForms: Error al cargar categorías para formularios de productos:", error);
        showMessageBox("Error al cargar categorías para productos. Revisa la consola para más detalles.", "error");
    }
}


async function loadProductsForEdit() {
    if (!isAuthReady) {
        console.log("loadProductsForEdit: Firebase no está autenticado aún.");
        return;
    }
    selectProductToEdit.innerHTML = '<option value="">-- Selecciona un producto --</option>';
    try {
        console.log("loadProductsForEdit: Cargando productos para edición...");
        const querySnapshot = await getDocs(productsCollectionRef);
        querySnapshot.forEach((doc) => {
            const product = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = product.name;
            selectProductToEdit.appendChild(option);
        });
        console.log("loadProductsForEdit: Productos cargados exitosamente.");
    } catch (error) {
        console.error("loadProductsForEdit: Error al cargar productos:", error);
        showMessageBox("Error al cargar productos.", "error");
    }
}

async function populateProductEditForm(productId) {
    if (!isAuthReady || !productId) {
        editedProductNameInput.value = '';
        editedProductPriceInput.value = '';
        editedProductImageUrlInput.value = '';
        editedProductCategorySelect.value = '';
        editedProductDescriptionInput.value = '';
        editedProductComponentsUrlInput.value = ''; // Limpiar nuevo campo
        editedProductVideoUrlInput.value = ''; // Limpiar nuevo campo
        return;
    }
    try {
        console.log("populateProductEditForm: Cargando datos para producto ID:", productId);
        const productDocRef = doc(db, `artifacts/${appId}/public/data/products`, productId);
        const docSnap = await getDoc(productDocRef); 
        
        if (docSnap.exists()) {
            const productData = docSnap.data();
            editedProductNameInput.value = productData.name;
            editedProductPriceInput.value = productData.price;
            editedProductImageUrlInput.value = productData.imageUrl;
            editedProductCategorySelect.value = productData.category || '';
            editedProductDescriptionInput.value = productData.description || '';
            editedProductComponentsUrlInput.value = productData.componentsUrl || ''; // Llenar nuevo campo
            editedProductVideoUrlInput.value = productData.videoUrl || ''; // Llenar nuevo campo
            console.log("populateProductEditForm: Datos de producto cargados:", productData);
        } else {
            console.log("populateProductEditForm: Producto no encontrado para ID:", productId);
            showMessageBox("Producto no encontrado.", "error");
        }
    } catch (error) {
        console.error("populateProductEditForm: Error al cargar datos del producto:", error);
        showMessageBox("Error al cargar datos del producto.", "error");
    }
}

async function updateProductInFirestore(productId, newName, newPrice, newImageUrl, newCategory, newDescription, newComponentsUrl, newVideoUrl) {
    if (!db || !userId) {
        showMessageBox("Error: Firebase o usuario no autenticado. No se puede actualizar el producto.", 'error');
        return;
    }
    try {
        const productDocRef = doc(db, `artifacts/${appId}/public/data/products`, productId);
        await updateDoc(productDocRef, {
            name: newName,
            price: newPrice,
            imageUrl: newImageUrl,
            category: newCategory,
            description: newDescription,
            componentsUrl: newComponentsUrl, // Actualizar nuevo campo
            videoUrl: newVideoUrl // Actualizar nuevo campo
        });
        showMessageBox(`Producto "${newName}" actualizado exitosamente.`, 'success');
        loadProductsForEdit();
        populateProductEditForm('');
    } catch (error) {
        console.error("Error al actualizar el producto:", error);
        showMessageBox("Error al actualizar el producto. Inténtalo de nuevo.", 'error');
    }
}

async function deleteProductFromFirestore(productId) {
    if (!db || !userId) {
        showMessageBox("Error: Firebase o usuario no autenticado. No se puede eliminar el producto.", 'error');
        return;
    }
    if (window.confirm("¿Estás seguro de que quieres eliminar este producto?")) {
        try {
            const productDocRef = doc(db, `artifacts/${appId}/public/data/products`, productId);
            await deleteDoc(productDocRef);
            showMessageBox("Producto eliminado exitosamente.", 'success');
            loadProductsForEdit();
            populateProductEditForm('');
        } catch (error) {
            console.error("Error al eliminar el producto:", error);
            showMessageBox("Error al eliminar el producto.", 'error');
        }
    }
}

// --- Event Listeners del DOM ---
document.addEventListener('DOMContentLoaded', () => {
    // Verificar si el usuario está logueado localmente (primera capa de seguridad)
    if (localStorage.getItem('loggedIn') !== 'true') {
        console.log("admin.js: No logueado localmente. Redirigiendo a login.html.");
        window.location.href = 'login.html';
        return;
    }

    // Inicializar Firebase y autenticación
    initFirebaseAndAuth();

    // Navegación entre secciones
    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const sectionId = this.dataset.section;
            if (sectionId) {
                showSection(sectionId);
            }
        });
    });

    // Manejar el formulario de Crear Categoría
    if (createCategoryForm) {
        createCategoryForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (!isAuthReady) {
                showMessageBox("Firebase no está autenticado. Intenta de nuevo.", "error");
                return;
            }
            const categoryName = document.getElementById('categoryName').value;
            const categoryImageUrl = document.getElementById('categoryImageUrl').value;
            // No hay descripción en este formulario, se podría añadir si es necesario

            if (!categoryName || !categoryImageUrl) {
                showMessageBox("Nombre y URL de imagen son obligatorios.", "warning");
                return;
            }

            try {
                await addDoc(categoriesCollectionRef, {
                    name: categoryName,
                    imageUrl: categoryImageUrl,
                    createdAt: serverTimestamp()
                });
                showMessageBox(`Categoría "${categoryName}" creada exitosamente.`, 'success');
                createCategoryForm.reset();
                loadCategoriesForEdit();
                loadCategoriesForProductForms(); // Recargar también los selects de productos
            } catch (error) {
                console.error("Error al crear categoría:", error);
                showMessageBox("Error al crear categoría.", "error");
            }
        });
    }

    // Manejar la selección y guardado de Editar Categoría
    selectCategoryToEdit.addEventListener('change', function() {
        populateCategoryEditForm(this.value);
    });

    if (saveCategoryChangesButton) {
        saveCategoryChangesButton.addEventListener('click', async function() {
            const categoryId = selectCategoryToEdit.value;
            const newName = editedCategoryNameInput.value;
            const newImageUrl = editedCategoryImageUrlInput.value;
            // Descripción no editable en este HTML, si se añade, habría que obtenerla aquí

            if (!categoryId) {
                showMessageBox("Por favor, selecciona una categoría para editar.", "warning");
                return;
            }
            if (!newName || !newImageUrl) {
                showMessageBox("Ambos campos (nombre y URL de imagen) son requeridos.", "warning");
                return;
            }
            await updateCategoryInFirestore(categoryId, newName, newImageUrl);
        });
    }

    // Añadir botón de Eliminar Categoría dinámicamente
    const deleteCategoryButton = document.createElement('button');
    deleteCategoryButton.className = 'action-button bg-red-600 hover:bg-red-700 w-full mt-4';
    deleteCategoryButton.textContent = 'Eliminar Categoría Seleccionada';
    if (editCategorySection) {
        editCategorySection.appendChild(deleteCategoryButton);
    }

    if (deleteCategoryButton) {
        deleteCategoryButton.addEventListener('click', async function() {
            const categoryId = selectCategoryToEdit.value;
            if (!categoryId) {
                showMessageBox("Por favor, selecciona una categoría para eliminar.", "warning");
                return;
            }
            await deleteCategoryFromFirestore(categoryId);
        });
    }

    // Manejar el formulario de Crear Producto
    if (createProductForm) {
        createProductForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (!isAuthReady) {
                showMessageBox("Firebase no está autenticado. Intenta de nuevo.", "error");
                return;
            }
            const productName = document.getElementById('productName').value;
            const productPrice = parseFloat(document.getElementById('productPrice').value);
            const productImageUrl = document.getElementById('productImageUrl').value;
            const productCategory = productCategorySelect.value;
            const productDescription = document.getElementById('productDescription').value;
            const productComponentsUrl = document.getElementById('productComponentsUrl').value; // Nuevo campo
            const productVideoUrl = document.getElementById('productVideoUrl').value;       // Nuevo campo

            if (!productName || isNaN(productPrice) || productPrice <= 0 || !productCategory) {
                showMessageBox("Nombre, precio (mayor a 0) y categoría son obligatorios.", "warning");
                return;
            }

            await addDoc(productsCollectionRef, {
                name: productName,
                price: productPrice,
                imageUrl: productImageUrl,
                category: productCategory,
                description: productDescription,
                componentsUrl: productComponentsUrl, // Guardar nuevo campo
                videoUrl: productVideoUrl,           // Guardar nuevo campo
                createdAt: serverTimestamp()
            });
            showMessageBox(`Producto "${productName}" creado exitosamente.`, 'success');
            createProductForm.reset();
            loadProductsForEdit();
            productCategorySelect.value = ''; // Resetear la selección
        });
    }

    // Manejar la selección y edición de productos
    selectProductToEdit.addEventListener('change', function() {
        populateProductEditForm(this.value);
    });

    if (saveProductChangesButton) {
        saveProductChangesButton.addEventListener('click', async function() {
            const productId = selectProductToEdit.value;
            const newName = editedProductNameInput.value;
            const newPrice = parseFloat(editedProductPriceInput.value);
            const newImageUrl = editedProductImageUrlInput.value;
            const newCategory = editedProductCategorySelect.value;
            const newDescription = editedProductDescriptionInput.value;
            const newComponentsUrl = editedProductComponentsUrlInput.value; // Obtener nuevo campo
            const newVideoUrl = editedProductVideoUrlInput.value;       // Obtener nuevo campo

            if (!productId) {
                showMessageBox("Por favor, selecciona un producto para editar.", "warning");
                return;
            }
            if (!newName || !newImageUrl || isNaN(newPrice) || newPrice <= 0 || !newCategory) {
                showMessageBox("Nombre, precio (mayor a 0), URL de imagen y categoría son obligatorios.", "warning");
                return;
            }
            await updateProductInFirestore(productId, newName, newPrice, newImageUrl, newCategory, newDescription, newComponentsUrl, newVideoUrl);
        });
    }

    // Añadir botón de Eliminar Producto dinámicamente
    const deleteProductButton = document.createElement('button');
    deleteProductButton.className = 'action-button bg-red-600 hover:bg-red-700 w-full mt-4';
    deleteProductButton.textContent = 'Eliminar Producto Seleccionado';
    if (editProductSection) {
        editProductSection.appendChild(deleteProductButton);
    }

    if (deleteProductButton) {
        deleteProductButton.addEventListener('click', async function() {
            const productId = selectProductToEdit.value;
            if (!productId) {
                showMessageBox("Por favor, selecciona un producto para eliminar.", "warning");
                return;
            }
            await deleteProductFromFirestore(productId);
        });
    }

    // Lógica para el botón de Cerrar Sesión
    if (logoutButton) {
        logoutButton.addEventListener('click', async function() {
            localStorage.removeItem('loggedIn');
            if (auth) {
                try {
                    await signOut(auth);
                    showMessageBox('Sesión cerrada. Redirigiendo a la página principal...', 'info');
                } catch (error) {
                    console.error("Error al cerrar sesión de Firebase:", error);
                    showMessageBox("Error al cerrar sesión.", "error");
                }
            } else {
                showMessageBox("No se pudo cerrar sesión de Firebase. Redirigiendo...", "warning");
            }
            setTimeout(() => {
                window.location.href = 'index.html'; // Redirigir a la página principal
            }, 1500);
        });
    }

    // Mostrar la primera sección por defecto al cargar y cargar categorías para productos
    showSection('createCategory');
    loadCategoriesForProductForms(); // Asegúrate de que las categorías para productos se carguen al inicio
});

// Exponer showMessageBox globalmente para que pueda ser llamada desde el HTML
window.showMessageBox = showMessageBox;
