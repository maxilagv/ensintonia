// Importaciones de Firebase
// Importamos 'db' y 'auth' directamente desde tu archivo de configuración centralizado
import { db, auth } from './firebaseconfig.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Importaciones de Firestore (mantenerlas aquí ya que son módulos específicos de Firestore)
import { collection, addDoc, getDoc, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Variables globales para Firebase (ahora 'auth' y 'db' vienen del import)
// let app; // Ya no es necesario si no lo exportamos de firebaseconfig.js y no lo usamos directamente aquí
// let db; // Viene del import
// let auth; // Viene del import
let userId = null;
let isAuthReady = false;
let appId; // Declarar appId globalmente

// Función para mostrar una caja de mensaje personalizada
function showMessageBox(message, type = 'info') {
    const existingMessageBox = document.querySelector('.message-box-overlay');
    if (existingMessageBox) {
        existingMessageBox.remove();
    }

    const messageBox = document.createElement('div');
    messageBox.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 message-box-overlay';
    
    const content = document.createElement('div');
    content.className = 'bg-white p-8 rounded-lg shadow-xl text-center max-w-sm mx-auto message-box-content';

    content.innerHTML = `
        <p class="text-xl font-semibold text-gray-800 mb-4">${message}</p>
        <button onclick="this.parentNode.parentNode.remove()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md transition duration-300">Cerrar</button>
    `;

    document.body.appendChild(messageBox);
    messageBox.appendChild(content); // Asegurarse de que el contenido se añada al messageBox

    setTimeout(() => {
        messageBox.classList.add('show');
        // Aplicar animaciones después de que el contenido esté en el DOM
        if (type === 'success') {
            content.classList.add('animate-bounce');
        } else if (type === 'error') {
            content.classList.add('animate-shake');
        }
    }, 10);
}

document.addEventListener('DOMContentLoaded', async function() {
    // Verificar si el usuario está logueado localmente (primera capa de seguridad)
    if (localStorage.getItem('loggedIn') !== 'true') {
        console.log("admin.js: No logueado localmente. Redirigiendo a login.html.");
        window.location.href = 'login.html';
        return;
    }

    // --- Configuración e Inicialización de Firebase (ahora centralizada en firebaseconfig.js) ---
    appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    
    // Ya no necesitamos parsear __firebase_config ni inicializar app/db/auth aquí.
    // console.log("admin.js: Firebase Configuración Cargada:", firebaseConfig); // Esto ya no es necesario aquí
    console.log("admin.js: Auth object from firebaseconfig.js:", auth); // Verificar que 'auth' se importó correctamente

    let authStateChecked = false; // Bandera para asegurar que onAuthStateChanged ha disparado al menos una vez

    // Observar cambios en el estado de autenticación (segunda capa de seguridad)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            isAuthReady = true;
            console.log("admin.js: Firebase Authenticated. User ID:", userId);
            // Una vez autenticado, podemos cargar los datos
            loadCategoriesForEdit();
            loadProductsForEdit();
        } else {
            // Solo redirigir si authStateChecked es true, lo que significa que ya hemos verificado la persistencia
            if (authStateChecked) {
                console.log("admin.js: No hay sesión activa en Firebase. Redirigiendo...");
                localStorage.removeItem('loggedIn'); // Limpia la bandera local por si acaso
                // Añadir un pequeño retraso para asegurar que el mensaje se vea
                setTimeout(() => {
                    window.location.href = 'login.html'; // Redirige al login
                }, 500); // Retraso de 0.5 segundos
            } else {
                console.log("admin.js: onAuthStateChanged disparado sin usuario, esperando la verificación de persistencia.");
                // No hacer nada aún, esperar la siguiente llamada de onAuthStateChanged o que se asiente.
            }
        }
        authStateChecked = true; // Marcar que onAuthStateChanged ha disparado al menos una vez
    });

    // Referencias a colecciones de Firestore (públicas para este ejemplo de admin)
    // Asegurarse de que db esté inicializado antes de crear las referencias
    const categoriesCollectionRef = collection(db, `artifacts/${appId}/public/data/categories`);
    const productsCollectionRef = collection(db, `artifacts/${appId}/public/data/products`);

    const navButtons = document.querySelectorAll('.nav-button');
    const sections = document.querySelectorAll('.section-content');
    const logoutButton = document.getElementById('logoutButton');

    const createCategoryForm = document.getElementById('createCategoryForm');
    const editCategoryForm = document.getElementById('editCategory');
    const selectCategoryToEdit = document.getElementById('selectCategoryToEdit');
    const editedCategoryNameInput = document.getElementById('editedCategoryName');
    const editedCategoryImageUrlInput = document.getElementById('editedCategoryImageUrl');
    const saveCategoryChangesButton = editCategoryForm.querySelector('.action-button');
    const deleteCategoryButton = document.createElement('button');
    deleteCategoryButton.className = 'action-button bg-red-600 hover:bg-red-700 w-full mt-4';
    deleteCategoryButton.textContent = 'Eliminar Categoría Seleccionada';
    editCategoryForm.appendChild(deleteCategoryButton);


    const createProductForm = document.getElementById('createProductForm');
    const editProductForm = document.getElementById('editProduct');
    const selectProductToEdit = document.getElementById('selectProductToEdit');
    const editedProductNameInput = document.getElementById('editedProductName');
    const editedProductPriceInput = document.getElementById('editedProductPrice');
    const editedProductImageUrlInput = document.getElementById('editedProductImageUrl');
    const saveProductChangesButton = editProductForm.querySelector('.action-button');
    const deleteProductButton = document.createElement('button');
    deleteProductButton.className = 'action-button bg-red-600 hover:bg-red-700 w-full mt-4';
    deleteProductButton.textContent = 'Eliminar Producto Seleccionado';
    editProductForm.appendChild(deleteProductButton);


    // Función para cambiar de sección
    function showSection(sectionId) {
        sections.forEach(section => {
            section.classList.add('hidden');
        });
        document.getElementById(sectionId).classList.remove('hidden');

        navButtons.forEach(button => {
            button.classList.remove('active');
        });
        document.querySelector(`.nav-button[data-section="${sectionId}"]`).classList.add('active');
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
            const docSnap = await getDoc(categoryDocRef); // Usar getDoc para un solo documento
            
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

    // --- Funciones para Productos ---
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
            return;
        }
        try {
            console.log("populateProductEditForm: Cargando datos para producto ID:", productId);
            const productDocRef = doc(db, `artifacts/${appId}/public/data/products`, productId);
            const docSnap = await getDoc(productDocRef); // Usar getDoc para un solo documento
            
            if (docSnap.exists()) {
                const productData = docSnap.data();
                editedProductNameInput.value = productData.name;
                editedProductPriceInput.value = productData.price;
                editedProductImageUrlInput.value = productData.imageUrl;
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


    // --- Event Listeners ---
    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const sectionId = this.dataset.section;
            if (sectionId) {
                showSection(sectionId);
                // Recargar listas al cambiar a secciones de edición
                if (sectionId === 'editCategory') {
                    loadCategoriesForEdit();
                } else if (sectionId === 'editProduct') {
                    loadProductsForEdit();
                }
            }
        });
    });

    // Manejar el formulario de Crear Categoría
    if (createCategoryForm) {
        createCategoryForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            console.log("admin.js: Intento de crear categoría.");
            if (!isAuthReady) {
                showMessageBox("Firebase no está autenticado. Intenta de nuevo.", "error");
                return;
            }
            const categoryName = document.getElementById('categoryName').value;
            const categoryImageUrl = document.getElementById('categoryImageUrl').value;

            try {
                await addDoc(categoriesCollectionRef, {
                    name: categoryName,
                    imageUrl: categoryImageUrl,
                    createdAt: serverTimestamp()
                });
                showMessageBox(`Categoría "${categoryName}" creada exitosamente.`);
                createCategoryForm.reset();
                loadCategoriesForEdit();
                console.log("admin.js: Categoría creada y lista de edición recargada.");
            } catch (error) {
                console.error("admin.js: Error al crear categoría:", error);
                showMessageBox("Error al crear categoría.", "error");
            }
        });
    }

    // Manejar la selección y edición de categorías
    selectCategoryToEdit.addEventListener('change', function() {
        console.log("admin.js: Categoría seleccionada para edición:", this.value);
        populateCategoryEditForm(this.value);
    });

    if (saveCategoryChangesButton) {
        saveCategoryChangesButton.addEventListener('click', async function() {
            console.log("admin.js: Intento de guardar cambios de categoría.");
            if (!isAuthReady) {
                showMessageBox("Firebase no está autenticado. Intenta de nuevo.", "error");
                return;
            }
            const categoryId = selectCategoryToEdit.value;
            const newName = editedCategoryNameInput.value;
            const newImageUrl = editedCategoryImageUrlInput.value;

            if (!categoryId) {
                showMessageBox("Por favor, selecciona una categoría para editar.", "error");
                return;
            }
            if (!newName || !newImageUrl) {
                showMessageBox("Ambos campos (nombre y URL de imagen) son requeridos.", "error");
                return;
            }

            try {
                const categoryDocRef = doc(db, `artifacts/${appId}/public/data/categories`, categoryId);
                await updateDoc(categoryDocRef, {
                    name: newName,
                    imageUrl: newImageUrl
                });
                showMessageBox(`Categoría "${newName}" actualizada exitosamente.`);
                loadCategoriesForEdit();
                populateCategoryEditForm('');
                console.log("admin.js: Categoría actualizada.");
            } catch (error) {
                console.error("admin.js: Error al actualizar categoría:", error);
                showMessageBox("Error al actualizar categoría.", "error");
            }
        });
    }

    if (deleteCategoryButton) {
        deleteCategoryButton.addEventListener('click', async function() {
            console.log("admin.js: Intento de eliminar categoría.");
            if (!isAuthReady) {
                showMessageBox("Firebase no está autenticado. Intenta de nuevo.", "error");
                return;
            }
            const categoryId = selectCategoryToEdit.value;

            if (!categoryId) {
                showMessageBox("Por favor, selecciona una categoría para eliminar.", "error");
                return;
            }

            if (confirm("¿Estás seguro de que quieres eliminar esta categoría?")) {
                try {
                    const categoryDocRef = doc(db, `artifacts/${appId}/public/data/categories`, categoryId);
                    await deleteDoc(categoryDocRef);
                    showMessageBox("Categoría eliminada exitosamente.");
                    loadCategoriesForEdit();
                    populateCategoryEditForm('');
                    console.log("admin.js: Categoría eliminada.");
                } catch (error) {
                    console.error("admin.js: Error al eliminar categoría:", error);
                    showMessageBox("Error al eliminar categoría.", "error");
                }
            }
        });
    }

    // Manejar el formulario de Crear Producto
    if (createProductForm) {
        createProductForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            console.log("admin.js: Intento de crear producto.");
            if (!isAuthReady) {
                showMessageBox("Firebase no está autenticado. Intenta de nuevo.", "error");
                return;
            }
            const productName = document.getElementById('productName').value;
            const productPrice = parseFloat(document.getElementById('productPrice').value);
            const productImageUrl = document.getElementById('productImageUrl').value;

            if (productPrice <= 0 || isNaN(productPrice)) {
                showMessageBox('El precio del producto debe ser un número mayor a 0.', 'error');
                return;
            }

            try {
                await addDoc(productsCollectionRef, {
                    name: productName,
                    price: productPrice,
                    imageUrl: productImageUrl,
                    createdAt: serverTimestamp()
                });
                showMessageBox(`Producto "${productName}" creado exitosamente.`);
                createProductForm.reset();
                loadProductsForEdit();
                console.log("admin.js: Producto creado y lista de edición recargada.");
            } catch (error) {
                console.error("admin.js: Error al crear producto:", error);
                showMessageBox("Error al crear producto.", "error");
            }
        });
    }

    // Manejar la selección y edición de productos
    selectProductToEdit.addEventListener('change', function() {
        console.log("admin.js: Producto seleccionado para edición:", this.value);
        populateProductEditForm(this.value);
    });

    if (saveProductChangesButton) {
        saveProductChangesButton.addEventListener('click', async function() {
            console.log("admin.js: Intento de guardar cambios de producto.");
            if (!isAuthReady) {
                showMessageBox("Firebase no está autenticado. Intenta de nuevo.", "error");
                return;
            }
            const productId = selectProductToEdit.value;
            const newName = editedProductNameInput.value;
            const newPrice = parseFloat(editedProductPriceInput.value);
            const newImageUrl = editedProductImageUrlInput.value;

            if (!productId) {
                showMessageBox("Por favor, selecciona un producto para editar.", "error");
                return;
            }
            if (!newName || !newImageUrl || isNaN(newPrice) || newPrice <= 0) {
                showMessageBox("Todos los campos (nombre, precio > 0 y URL de imagen) son requeridos.", "error");
                return;
            }

            try {
                const productDocRef = doc(db, `artifacts/${appId}/public/data/products`, productId);
                await updateDoc(productDocRef, {
                    name: newName,
                    price: newPrice,
                    imageUrl: newImageUrl
                });
                showMessageBox(`Producto "${newName}" actualizado exitosamente.`);
                loadProductsForEdit();
                populateProductEditForm('');
                console.log("admin.js: Producto actualizado.");
            } catch (error) {
                console.error("admin.js: Error al actualizar producto:", error);
                showMessageBox("Error al actualizar producto.", "error");
            }
        });
    }

    if (deleteProductButton) {
        deleteProductButton.addEventListener('click', async function() {
            console.log("admin.js: Intento de eliminar producto.");
            if (!isAuthReady) {
                showMessageBox("Firebase no está autenticado. Intenta de nuevo.", "error");
                return;
            }
            const productId = selectProductToEdit.value;

            if (!productId) {
                showMessageBox("Por favor, selecciona un producto para eliminar.", "error");
                return;
            }

            if (confirm("¿Estás seguro de que quieres eliminar este producto?")) {
                try {
                    const productDocRef = doc(db, `artifacts/${appId}/public/data/products`, productId);
                    await deleteDoc(productDocRef);
                    showMessageBox("Producto eliminado exitosamente.");
                    loadProductsForEdit();
                    populateProductEditForm('');
                    console.log("admin.js: Producto eliminado.");
                } catch (error) {
                    console.error("admin.js: Error al eliminar producto:", error);
                    showMessageBox("Error al eliminar producto.", "error");
                }
            }
        });
    }

    // Lógica para el botón de Cerrar Sesión
    if (logoutButton) {
        console.log("admin.js: Logout button found. Attaching event listener.");
        logoutButton.addEventListener('click', async function() {
            console.log("admin.js: Logout button clicked.");
            localStorage.removeItem('loggedIn'); // Limpia la bandera local
            
            if (auth) {
                try {
                    console.log("admin.js: Attempting Firebase signOut...");
                    await auth.signOut(); // Cierra la sesión de Firebase
                    console.log("admin.js: Firebase signOut successful.");
                    showMessageBox('Sesión cerrada. Redirigiendo al login...', 'info');
                } catch (error) {
                    console.error("admin.js: Error al cerrar sesión de Firebase:", error);
                    showMessageBox("Error al cerrar sesión.", "error");
                }
            } else {
                console.warn("admin.js: Firebase auth object is not available for signOut.");
                showMessageBox("No se pudo cerrar sesión de Firebase. Redirigiendo...", "error");
            }

            setTimeout(() => {
                window.location.href = 'login.html'; // Redirige al login
            }, 1500);
        });
    } else {
        console.error("admin.js: Logout button not found with ID 'logoutButton'.");
    }

    // Mostrar la primera sección por defecto al cargar
    showSection('createCategory');
});
