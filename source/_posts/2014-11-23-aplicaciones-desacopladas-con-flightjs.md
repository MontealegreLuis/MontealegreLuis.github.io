---
title: Aplicaciones desacopladas con Flight JS
tags:
    - Flight.js
    - RequireJS
    - Twig.js
categories:
    - JavaScript
use:
    - posts_categories
---
[Flight][1] es un framework Javascript ligero, basado en componentes y dirigido por eventos desarrollado por Twitter.
Flight mapea componentes a nodos del [DOM][3] y refuerza la [separación de responsabilidades][2] en nuestro código,
ya que cuando creamos un componente no tenemos una referencia a él, por lo tanto, no es posible crear relaciones
explícitas entre componentes. En su lugar los components de Flight emiten eventos, a los que se suscriben otros
componentes.

Flight usa los eventos del DOM como 'proxies' para los eventos de componentes, lo cual le da mayor flexibilidad, ya que
un componente puede suscribirse a un evento a nivel de documento (`ḑocument`) o puede solo escuchar eventos
pertenecientes a un nodo del DOM (`#price`). Los componentes que se suscriben a eventos no distinguen entre eventos de
otros componentes (p. ej. `clientProceedToCheckout`) y eventos nativos (p. ej. `click`).

Otra ventaja de Flight es que podemos distinguir dos tipos de componentes principales: componentes de interfaz y
componentes de datos. De este modo las aplicaciones de Flight pueden entenderse como colecciones de componentes.

## Show me the code

Para ejemplificar el uso de Flight desarrollaremos una pequeña interfaz de 'carro de compras', con un formulario
con productos y una tabla donde se mostrarán los productos que vamos agregando, así como el total a pagar.

<img src="/images/content/flight-demo-page.png" class="img-responsive img-thumbnail" alt="Interfaz de carro de compras">

### Primero los módulos

Antes de iniciar con los componentes, pensemos en los [módulos][4] que conforman nuestra aplicación. Necesitaremos un
catálogo de productos para que los clientes puedan seleccionar lo que quieren comprar. Nuestro catálogo debe poder
recuperar todos los productos disponibles y debe poder buscar un producto en particular.

~~~javascript
// web/js/store/ProductsCatalog.js

var ProductsCatalog = function() {

    var products;

    this.load = function(options) {
        var productsLoaded = options.callback || this.setProducts;

        options.request.ajax({
            url: options.url,
            dataType: 'json',
            async: false,
            success: productsLoaded
        });
    };

    this.setProducts = function(allProducts) {
        products = allProducts;
    };

    this.productOfId = function(id) {
        var i;

        for (i in products) {
            if (products[i].productId == id) {
                return products[i];
            }
        }
    };

    this.allProducts = function() {
        return products;
    }

    return this;
};
~~~

Nuestro carro de compras manejará una única orden de compra, la cual estará compuesta por varios elementos (items) que
contienen los datos del producto y la cantidad que se desea comprar.Cada item debe poder calcular el total a pagar por
la cantidad de productos seleccionados.

~~~javascript
// web/js/store/OrderItem.js

var OrderItem = function(product, quantity) {

    this.productId = function() {
        return product.productId;
    };

    this.productName = function() {
        return product.name;
    };

    this.unitPrice = function() {
        return product.unitPrice;
    }

    this.quantity = function() {
        return quantity;
    }

    this.total = function() {
        return product.unitPrice * quantity;
    };

    return this;
};
~~~

Por último, nuestro carro de compra, al cual podemos agregar o quitar productos y le podemos consultar cuál será el
total a pagar.

~~~javascript
// web/js/store/ShoppingCart.js

var ShoppingCart = function() {

    var orderItems = [];

    this.addItem = function(product, quantity) {
        var item = new OrderItem(product, quantity);

        orderItems[item.productId()] = item;

        return item;
    }

    this.removeItem = function(item) {
        orderItems.splice(item.productId(), 1);
    }

    this.total = function() {
        var index, total = 0;

        for (index in orderItems) {
            total += orderItems[index].total();
        }

        return total;
    }

    return this;
};
~~~

Una ventaja de diseñar los módulos antes de los componentes Flight, es que podemos hacer pruebas unitarias sin necesidad
de asociarlos a ninguna interfaz gráfica. Además de que si algún día decidimos dejar de usar Flight nuestra lógica no
se encuentra contenida en el código del framework.

### Algunos detalles de Flight

Flight utiliza [RequireJS][5] para la carga de módulos y [jQuery][6] para el manejo de eventos y manipulación del DOM.
La definición de un componente en Flight es de la siguiente forma:

~~~javascript
define(['vendor/flight/lib/component'], function(defineComponent) {
    var Component = function() { /* ... */ };

    return defineComponent(Component);
}
~~~

Flight asocia un componente a un nodo del DOM a través del método `attachTo` el cuál recibe dos argumentos, el primero
es un selector válido, y el segundo es un objeto con los atributos que queremos que tenga nuestro componente.
Generalmente los atributos son selectores de nodos dentro del nodo principal (el selector de un botón submit dentro de
un form, por ejemplo) u objetos que queremos inyectar como dependencia a nuestro componente, por ejemplo un objeto
`ProductsCatalog`.

~~~javascript
Component.attachTo('#component-id', {
    selector: '#some-id',
    dependency: module,
});
~~~

### Ahora si, los componentes

Primero identificaremos qué componentes de datos y qué componentes de interfaz serán necesarios. De inicio tenemos dos
componentes de interfaz uno para el formulario (`UiOrderItem`) y otro para la tabla con los productos agregados
(`UiShoppingCart`) y un componente de datos (`DataShoppingCart`).

<img src="/images/content/flight-demo-components.png" class="img-responsive img-thumbnail" alt="Los componentes">

El componente `UiOrderItem` tiene dos tareas, una es actualizar las opciones del elemento `select` del formulario,
para la cual se suscribe al evento `data.whenProductsAreLoaded` y la otra es notificar cuando se agrega un elemento al
carrito, para lo cual publica el evento `ui.whenProductIsAdded`, este evento se emite en el evento `submit` del
formulario.

<img src="/images/content/ui-order-item-events.png" class="img-responsive img-thumbnail" alt="Eventos de UiOrderItem">

Si consideramos que nuestro formulario es el siguiente:

~~~html
<!-- web/order.html -->

<form id="item-form">
    <label for="product">Product</label>
    <select name="product" id="product">
        <option value="">Choose a product</option>
    </select>
    <label for="quantity">Quantity</label>
    <input type="text" name="quantity" id="quantity">
    <button type="submit">Add to cart</button>
</form>
~~~

Estaríamos asociando nuestro componente `UiOrderItem` al formulario con ID `item-form`. También necesitamos indicarle al
componente cuál es el selector para productos (y que se puedan actualizar los elementos `option` del `select`) y el
selector del `input` de cantidad para indicar al carro de compras cuántos productos quiere nuestro cliente.

Para generar los elementos `option` usaremos un template de [Twig.js][7] con el siguiente contenido:

~~~twig
{ # web/js/templates/products.html.twig #}

<option value="">Choose a product</option>
{ % for product in products %}
    <option value="{ { product.productId }}">{ { product.name }}</option>
{ % endfor %}
~~~

Flight utiliza módulos a los que llama páginas, donde se cargan los módulos que usará la aplicación y se inicializan
los objetos. Así nuestro código para asociar nuestro componente quedaría de la siguiente forma:

~~~javascript
// web/js/page/ShoppingCartPage.js

define(function (require) {

    var view = require('twig');
    var UiOrderItem = require('component/UiOrderItem');

    var ShoppingCartPage = function() {

        this.init = function() {
            view.twig({href: '/js/templates/products.html.twig', async: false, id: 'products'});

            UiOrderItem.attachTo('#item-form', {
                quantitySelector: '#quantity',
                productSelector: '#product',
                productsTemplate: view.twig({ref: 'products'})
            });
        };
    };

    return ShoppingCartPage;
};
~~~

Dentro de nuestro componente usamos el método `attributes` para declarar los atributos (selectores o dependencias) de
nuestro componente. El objeto que pasamos a `atributes` declara valores default para las propiedades diferentes de
`null` (p. ej. `productsSelector: '#product'` indica que el valor default del atributo es `#product`), mientras que un
valor nulo indica que el atributo es obligatorio y que debemos proporcionar su valor a través del
método `attachTo` (p. ej. `productsTemplate: null` indica que el atributo es obligatorio).

~~~javascript
// web/js/component/UiOrderITem.js

var UiOrderItem = function() {

    this.attributes({
        quantitySelector: null,
        productSelector: null,
        productsTemplate: null
    });

    /* ... */
};
~~~

Los métodos de un componente que se suscriben a un evento reciben dos argumentos. El primero es el nombre del evento (para
el caso de eventos de componentes) o un objeto `event` (para el caso de los eventos nativos del DOM). El segundo
argumento es un objeto con los valores que el componente que publica el evento considera necesarios. Para nuestro
ejemplo, el objeto que recibe el método `refreshProductsOptions` como segundo argumento contiene los productos que se
mostrarán en el `select` (`data.products`).

~~~javascript
// web/js/component/UiOrderITem.js

var UiOrderItem = function() {

    /* .. */

    this.refreshProductsOptions = function(event, data) {
        this
            .select('productSelector')
            .html(this.attr.productsTemplate.render({products: data.products}));
    };

    /* .. */
};
~~~

El nodo asociado a un componente en Flight es accesible a través de dos variables; 1) La variable `node` que hace
referencia al elemento del DOM y 2) la variable `$node` que es su equivalente en jQuery.¸El método `select` de un
component es el equivalente de `$node.find(attributeName)`. En nuestro caso `this.select('productSelector')` es
equivalente a `this.$node.find('#product')` ya que el valor de `this.attr.productSelector` es `#product`.

El método `addItem` se suscribirá al evento `submit` de nuestro formulario y publicará el evento `ui.whenProductIsAdded`
pasando como datos el ID del producto y la cantidad de productos que ingresó nuestro cliente.

~~~javascript
// web/js/component/UiOrderITem.js

var UiOrderItem = function() {

    /* ... */

    this.addItem = function (event) {
        event.preventDefault();

        this.trigger('ui.whenProductIsAdded', {
            productId: this.select('productSelector').val(),
            quantity: this.select('quantitySelector').val()
        });
    };

    /* .. */
};
~~~

Para registrar los eventos de un componente usamos el método `after` de Flight. En nuestro ejemplo, el método 
`refreshProductsOptions` se suscribe al evento `data.whenProductsAreLoaded` y el método `addItem` se suscribe al evento
`submit`

~~~javascript
// web/js/component/UiOrderITem.js

var UiOrderItem = function() {

    /* ... */

    this.after('initialize', function () {
        this.on(document, 'data.whenProductsAreLoaded', this.refreshProductsOptions);
        this.on('submit', this.addItem);
    });

    /* ... */
};
~~~

El componente `UiShoppingCart` no publica ningún evento, pero se suscribe a dos eventos. El primero es
`data.whenItemIsAddedToCart` al cuál deberá responder agregando una fila a la tabla. El segundo es
`data.whenCartTotalHasChanged` al cual deberá responder actualizando la celda de total.

<img src="/images/content/ui-order-item-events.png" class="img-responsive img-thumbnail" alt="Eventos de UiShoppingCart">

Si consideramos que nuestro formulario es el siguiente:

~~~html
<!-- web/order.html -->

<table id="items-table">
    <thead>
        <tr>
            <th>Product</th>
            <th>Unit price</th>
            <th>Quantity</th>
            <th>Total</th>
        </tr>
    </thead>
    <tbody></tbody>
    <tfoot>
        <tr>
            <td colspan="3">Total</td>
            <td id="cart-total"></td>
        </tr>
    </tfoot>
</table>
~~~

Nuestro componente quedaría registrado de la siguiente forma:

~~~javascript
// web/js/page/ShoppingCartPage.js

view.twig({href: '/js/templates/item.html.twig', async: false, id: 'item'});
view.twig({href: '/js/templates/cart-total.html.twig', async: false, id: 'total'});

UiShoppingCart.attachTo('#items-table', {
    tableBodySelector: 'tbody',
    totalSelector: '#cart-total',
    itemTemplate: view.twig({ref: 'item'}),
    totalTemplate: view.twig({ref: 'total'})
});
~~~

Y el código de nuestro componente quedaría de la siguiente forma:

~~~javascript
// web/js/component/UiShoppingCart.js

var UiShoppingCart = function() {

    this.attributes({
        totalSelector: null,
        tableBodySelector: null,
        itemTemplate: null,
        totalTemplate: null
    });

    this.appendProduct = function (event, data) {
        this.select('tableBodySelector').append(this.attr.itemTemplate.render({item: data.item}));
    }

    this.updateTotal = function (event, data) {
        this.select('totalSelector').html(this.attr.totalTemplate.render({cart: data.cart}));
    }

    this.after('initialize', function() {
        this.on(document, 'data.whenItemIsAddedToCart', this.appendProduct);
        this.on(document, 'data.whenCartTotalHasChanged', this.updateTotal);
    });
};
~~~

Por último nuestro componente de datos:

<img src="/images/content/data-shopping-cart-events.png" class="img-responsive img-thumbnail" alt="Eventos de DataShoppingCart">

Nuestro componente de datos suscribe el método `addItemToCart` al evento `ui.whenProductIsAdded`. El método `addItemToCart`
agrega al carro de compras un producto que recupera del catálogo a través de su ID, y después publica los eventos
`data.whenItemIsAddedToCart` y `data.whenCartTotalHasChanged`. El método `loadProducts` recupera los productos del
catálogo y publica el evento `data.whenProductsAreLoaded`.

~~~javascript
// web/js/component/DataShoppingCart.js

var DataShoppingCart = function() {

    this.attributes({
        catalog: null,
        cart: null
    });

    this.loadProducts = function() {
        this.trigger('data.whenProductsAreLoaded', {products: this.attr.catalog.allProducts()});
    };

    this.addItemToCart = function(event, item) {
        var productItem = this.attr.cart.addItem(
            this.attr.catalog.productOfId(item.productId), item.quantity
        );

        this.trigger('data.whenItemIsAddedToCart', {item: productItem});
        this.trigger('data.whenCartTotalHasChanged', {cart: this.attr.cart});
    };

    this.after('initialize', function () {
        this.on('ui.whenProductIsAdded', this.addItemToCart);
        this.loadProducts();
    });
};
~~~

Este componente no tiene atributos que hagan referencia a la interfaz (selectores o templates). En su lugar tiene como
dependencias los módulos con la lógica de nuestra aplicación (`ProductsCatalog` y `ShoppingCart`).

~~~javascript
// web/js/page/ShoppingCartPage.js

var $ = require('jquery');
var ShoppingCart = require('store/ShoppingCart');
var ProductsCatalog = require('store/ProductsCatalog');

var cart = new ShoppingCart();
var catalog = new ProductsCatalog();

catalog.load({request: $, url: '/products'});

DataShoppingCart.attachTo(document, {
    catalog: catalog,
    cart: cart
});
~~~

Podemos resumir las relaciones entre componentes de nuestra aplicación de la siguiente forma. Las flechas indican qué
componente publica un evento, qué componente se suscribe y a través de qué método (los métodos aparecen subrayados).

<img src="/images/content/application-components-diagram.png" class="img-responsive img-thumbnail" alt="Aplicación">

Por último, como la mayoría de las aplicaciones que usan RequireJs la aplicación se inicializa en un archivo `main.js`
donde llamamos al método `init` de nuestra página.

~~~javascript
// web/js/main.js

require([
        'vendor/flight/lib/compose',
        'vendor/flight/lib/registry',
        'vendor/flight/lib/advice',
    ],
    function (compose, registry, advice) {
        compose.mixin(registry, [advice.withAdvice]);

        require(['page/ShoppingCartPage'], function (ShoppingCartPage) {
            var page = new ShoppingCartPage();

            page.init();
        });
    }
);
~~~

Espero que este post te de una idea del uso y ventajas de Flight. En el siguiente post haremos el testing de nuestros
componentes y módulos. Si tienes algun comentario lo agradeceré mucho. Puedes revisar el código completo en este repo en
[Github][8]. Si al probar el código algo no funciona y necesitas ayuda por favor deja tu pregunta [aquí][9] así más
gente puede ayudarte y más personas se beneficiarán con la respuesta.

[1]: http://flightjs.github.io/
[2]: http://en.wikipedia.org/wiki/Separation_of_concerns
[3]: http://es.wikipedia.org/wiki/Document_Object_Model
[4]: http://eloquentjavascript.net/10_modules.html
[5]: http://requirejs.org/
[6]: http://jquery.com/
[7]: https://github.com/justjohn/twig.js/
[8]: https://github.com/MontealegreLuis/flight-demo
[9]: http://preguntas.hfpuebla.org/
