---
title: Testing de componentes Flight
tags:
    - Flight.js
    - Testing
    - Jasmine
categories:
    - JavaScript
use:
    - posts_categories
---
Esta es la segunda parte del post de [Aplicaciones desacopladas con Flight JS][1]. En esta segunda parte desarrollaremos
las pruebas unitarias para los componentes de nuestra aplicación de ejemplo.

La aplicación de ejemplo que desarrollamos en el post anterior puede crearse con [Yeoman][2]. Hay un generador para
[Flight][3] que podemos instalar de manera global.

~~~bash
$ npm install -g generator-flight
~~~

Este generador nos permite crear aplicaciones, componentes, mixins y páginas

~~~bash
$ flight <app-name>
$ flight:component <component-name>
$ flight:mixin <mixin-name>
$ flight:page <page-name>
~~~

El generador instala algunas dependencias usando [bower][4] y otras usando [npm][5]

Con Bower instala:

* Flight, RequireJS, Jasmine jQuery y Jasmine Flight

Con npm instala:

* Gulp, el runner de pruebas unitarias de Karma, y el servidor de archivos estáticos de Node.

Las dependencias que instala con npm son para poder ejecutar las pruebas unitarias de los componentes Flight con Jasmine.
Las pruebas se ejecutan usando [Karma][6] que nos permite ejecutar las pruebas en un navegador en modo headless con
[PhantomJS][8].

En este post explicaré como ejecutar los specs para componentes de Flight sin Karma, ya que considero que no es
necesario ejecutar pruebas en modo 'headless' para los componentes. En su lugar podemos escribir pruebas de
[aceptación][9] con [Codeception][10] que incluyan el funcionamiento de los componentes (que también pueden hacerse
'headles' con PhantomJS). Lo cuál explicaré en el siguiente post.

La configuración que usaré resulta excesiva si es que ya probaste el generador y te dejó todo listo para usar Karma.
Para hacer que las pruebas unitarias funcionen debemos hacer una combinación de paquetes de bower instalados con npm, ya
que el objetivo es evitar el navegador y que nuestros tests sean lentos. Si no te interesa evitar el
navegador puedes saltar a la parte de <a href="#data-providers">proveedores de datos</a> y
<a href="#fake-data">generación de datos para pruebas</a>.

## Evitando el navegador

El primer problema es configurar un ambiente similar al de un navegador. Esto significa que variables como `window` y
`document` existan en el espacio de nombres `global` de Node. Esto se puede lograr con los paquetes [jsdom][11]
y [jQuery][12]

~~~javascript
# specs-runner.js

var jQuery;
var jsdom = require('jsdom');

// Setup window and document, jQuery will need them to work properly
global.window = jsdom.jsdom().parentWindow
global.document = global.window.document;

// Add jQuery and $ to the global space
jQuery = require('jquery');
global.jQuery = global.$ = jQuery;
~~~

El siguiente paso es configurar [RequireJS][13], ya que en el navegador nuestros componentes lo usan. Debemos tener la
misma configuración en Node para que funcionen, y agregar la funcion `define` al espacio global.

~~~javascript
# specs-runner.js

var requirejs = require('requirejs');

// Use the same value you use in the browser for 'paths' key.
requirejs.config({
    baseUrl: './web/js',
    nodeRequire: require,
    paths: {
        'flight': 'vendor/flight',
        'store': 'src/store',
        'component': 'src/component'
    }
});

global.define = requirejs;
~~~

Debemos también instalar y configurar [Jasmine para Node][14] en su versión beta 4, ya que es la usa [Jasmine][16] en su
versión 2 y que necesitamos para poder usar [Jasmine para jQuery][15]. Debemos agregar algunas variables y funciones al
espacio global para que funcionen igual que en el navegador.

~~~javascript
# specs-runner.js

var jasmine;

// Setup Jasmine
jasmine = require('jasmine-node/lib/jasmine-node/jasmine-loader.js');
global.jasmine = jasmine;

// map jasmine.Env to global namespace
jasmineEnv = global.jasmine.getEnv();
for (key in jasmineEnv) {
    if (jasmineEnv[key] instanceof Function) {
        global[key] = jasmineEnv[key];
    }
};

global.jasmine.addMatchers = jasmineEnv.addMatchers;
~~~

El siguiente paso es configurar [Jasmine para Flight][17]. Al igual que en los otros casos es necesario registrar
algunas funciones en el espacio global.

~~~javascript
# specs-runner.js

var jasmineFlight;

jasmineFlight = require('jasmine-flight');

// map jasmine-flight methods to global namespace
for (key in jasmineFlight) {
    if (jasmineFlight[key] instanceof Function) {
        global[key] = jasmineFlight[key];
    }
};
~~~

Por último para poder crear 'spies' para eventos debemos usar Jasmine para jQuery y agregar `spyOnEvent` al espacio
global.

~~~javascript
# specs-runner.js

jasminejQuery = require('jasmine-jquery/lib/jasmine-jquery');
global.spyOnEvent = window.spyOnEvent;
~~~

En el caso de Jasmine para Flight, no pude configurarlo para que use la función `require` de RequireJS en lugar del
`require` de Node. Si sabes de alguna forma te agredeceré que lo expongas en los comentarios. Así que el demo usa un
[fork mio][18] donde reemplazo las apariciones de `require` por `requirejs`. Para esto debemos agregar la función al espacio
global de nombres `global.requirejs = requirejs`. Así, el contenido del archivo `package.json` sería el siguiente:

~~~json
{
  "name": "flight_demo",
  "version": "1.0.0",
  "devDependencies": {
    "jasmine-flight": "https://github.com/MontealegreLuis/jasmine-flight/archive/no_browser.tar.gz",
    "jasmine-jquery": "https://github.com/velesin/jasmine-jquery/archive/2.0.5.tar.gz",
    "jasmine-node": "^2.0.0-beta4",
    "jquery": "^2.1.1",
    "jsdom": "^1.3.1",
    "requirejs": "~2.1.11"
  },
  "scripts": {
    "test": "node ./specs-runner.js"
  }
}
~~~

Puedes revisar el contenido completo del archivo `specs-runner.js` [aquí][19].

## Testing de componentes

Cuando hacemos tests a los componentes de Flight es muy importante hacer pruebas a la **interfaz** del componente y no a su
comportamiento interno (es una recomendación que se puede aplicar al testing en general). Esto asegura que no tengamos
que modificar las pruebas cada que modificamos el código del componente. Desde el punto de vista de la interfaz, los
componentes de flight se suscriben a eventos y en ocasiones, como respuesta, publican eventos, esa es su interfaz.

### Pruebas a nuestro componente de datos

Jasmine Flight nos proporciona métodos para crear specs para componentes de Flight. La primera diferencia con un spec
de Jasmine tradicional es que reemplazamos `describe` por la función `describeComponent`. Dentro de `describeComponent`
en el `beforeEach` podemos llamar al método `setupComponent` que nos permite pasar a nuestro componente los valores de
sus atributos, de forma similar al método `attachTo`. En nuestro ejemplo creamos dos [fakes][20] uno para `catalog` y
otro para `cart`. El spec más simple que podemos generar verifica que el componente esté definido (`toBeDefined`).

~~~javascript
# web/js/spec/component/DataShoppingCart.spec.js

describeComponent('component/DataShoppingCart', function () {

    beforeEach(function () {
        this.setupComponent({
            catalog: {allProducts: function(){}, productOfId: function(){}},
            cart: {addItem: function() { return {} }}
        });
    });

    it('should be defined', function () {
        expect(this.component).toBeDefined();
    });
});
~~~

En el siguiente test verificamos que el componente publique el evento `data.whenItemIsAddedToCart` cuando se publique
el evento `ui.whenProductIsAdded`. Para lograrlo creamos un [spy][21] para el evento `ui.whenProductIsAdded`. Disparamos
el evento `ui.whenProductIsAdded` en el nodo HTML asociado con el componente, y verificamos que el componente publique
el evento esperado.

~~~javascript
# web/js/spec/component/DataShoppingCart.spec.js

it("should listen for 'ui.whenProductIsAdded' events and trigger 'data.whenItemIsAddedToCart' event", function () {
    spyOnEvent(this.$node, 'data.whenItemIsAddedToCart');

    this.$node.trigger('ui.whenProductIsAdded', {});

    expect('data.whenItemIsAddedToCart').toHaveBeenTriggeredOn(this.$node);
});
~~~

El componente también debe publicar el evento `data.whenProductsAreLoaded` al ejecutar el método `loadProducts`. El
código es similar solo que en lugar de disparar un evento en el nodo HTML del componente, ejecutamos el método y
verificamos que el evento haya sido publicado.

~~~javascript
# web/js/spec/component/DataShoppingCart.spec.js

it("should trigger 'data.whenProductsAreLoaded' event when method 'loadProducts' is executed", function () {
    spyOnEvent(this.$node, 'data.whenProductsAreLoaded');

    this.component.loadProducts({});

    expect('data.whenProductsAreLoaded').toHaveBeenTriggeredOn(this.$node);
});
~~~

### Pruebas a nuestro componente de interfaz

Para probar nuestro componente de interfaz, necesitaremos un [fixture][22] de HTML que pasaremos como primer argumento
al método `setupComponent`. Este fixture reemplaza al nodo HTML asociado al componente que Jasmine Flight crea por
default (el cual es un `div`). Lo necesitamos porque nuestro componente de interfaz busca elementos HTML con IDs
específicos que necesitamos pasar a nuestro spec para que funcione.

El primer test verifica que el componente actualice el HTML de la tabla que contiene los elementos del carro de compras
cada vez que se publique el evento `data.whenItemIsAddedToCart`.

~~~javascript
# web/js/spec/component/UiShoppingCart.spec.js

describeComponent('component/UiShoppingCart', function () {
    var itemRow = '<tr><td>Lightsaber</td><td>$20.00</td><td>2</td><td>$ 40.00</td></tr>';
    var cartTotal = '<p>$40.00</p>';

    beforeEach(function () {
        this.setupComponent(
            '<table><tbody></tbody><tr><td id="cart-total"></td></tr></table>', {
            totalSelector: '#cart-total',
            cartItemsSelector: 'tbody',
            itemTemplate: {render: function() {return itemRow;}},
            totalTemplate: {render: function() {return cartTotal;}}
        });
    });

    it("should listen for 'data.whenItemIsAddedToCart' events and update the cart items HTML", function () {
        this.component.trigger(document, 'data.whenItemIsAddedToCart', {});

        expect(this.component.select('cartItemsSelector').html()).toEqual(itemRow);
    });
});
~~~

<h2 id="data-providers">Proveedores de datos</h2>

El objetivo de un proveedor de datos es alimentar un test con varios valores de prueba para evitar repetir el código de
un spec varias veces. Investigando encontré este [post][23] que implementa una función `using` que provee de datos a un spec.
Encontré también este segundo [post][24] donde se mueve la función `using` fuera del spec y permite el uso de funciones
para alimentar el test con datos. Me gustó más el estilo del primer post, aunque es un poco antiguo (Jasmine 1.2), así
que terminé con una combinación de ambos ejemplos:

~~~javascript
# web/js/spec/helpers/UsingHelper.js

global.using = function(name, values, func) {
    for (var i = 0, count = values.length; i < count; i++) {
        if (Object.prototype.toString.call(values[i]) !== '[object Array]') {
            values[i] = [values[i]];
        }
        // Pass the name of the spec and its values to add them to their description
        it.specName = name;
        it.data = values[i];
        func.apply(this, values[i]);
        // Clear the extra data once it has been used
        it.data = null;
        it.specName = null;
    }
}
var it_multi = function _it_multi(desc, func) {
    var _data = [], _desc = desc;

    // Check if the current spec was called inside a 'using' call
    if (it.data) {
        _data = it.data;
        // Update the spec description
        _desc = desc + ' (with ' + it.specName +  ' using values [' + _data.toString() + '])';
    }

    jasmine.getEnv().it(_desc, function() {
        return function() {
            func.apply(func, _data);
        }
    });
};

if ( it && typeof it == 'function') {
    it = it_multi;
}
~~~

Debemos incluir este archivo en `specs-runner.js` para usarlo en nuestros specs. Tomemos como
ejemplo el método `total` del módulo `OrderItem`. El segundo argumento que pasamos a `using` es un arreglo donde el
primer elemento representan valores para el precio unitario y la cantidad de productos que se agregan al carro y el
segundo argumento es el total que esperamos que calcule nuestro módulo.

~~~javascript
describe('OrderItem', function () {
    using(
        'valid products',
        [
            [[2000, 4], 8000],
            [[3000, 3], 9000],
            [[1500, 5], 7500]
        ],
        function(item, total) {
            it('should calculate an item total price', function () {
                var cartItem = new OrderItem(item[0], item[1]);

                expect(cartItem.total()).toBe(total);
            });
        }
    );
});
~~~

Sin embargo la salida que producen nuestros specs no es tan descriptiva como quisieramos.

    should calculate an item total price (with valid products using values [2000,4,8000]) - 156 ms
    should calculate an item total price (with valid products using values [3000,3,9000]) - 1 ms
    should calculate an item total price (with valid products using values [1500,5,7500]) - 1 ms

Podemos mejorar la legibilidad de nuestros specs si convertimos nuestros valores en objetos y les agregamos un método
`toString`.

~~~javascript
var toString = function() {
    return 'price: ' + this.product.unitPrice + ', quantity: ' + this.quantity;
};
var totalToString = function() {
    return ' expecting total to be: ' + this.total;
}

describe('OrderItem', function () {
    using(
        'valid products',
        [
            [
                {product: {unitPrice: 2000}, quantity: 4, toString: toString},
                {total: 8000, toString: totalToString}
            ],
            [   {product: {unitPrice: 3000}, quantity: 3, toString: toString},
                {total: 9000, toString: totalToString}
            ],
            [
                {product: {unitPrice: 1500}, quantity: 5, toString: toString},
                {total: 7500, toString: totalToString}
            ]
        ],
        function(item, expected) {
            it('should calculate an item total price', function () {
                var cartItem = new OrderItem(item.product, item.quantity);

                expect(cartItem.total()).toBe(expected.total);
            });
        }
    );
});
~~~

Lo cual mejora notablemente la legibilidad de nuestros specs.

    should calculate an item total price (with valid products using values [price: 2000, quantity: 4, expecting total to be: 8000]) - 133 ms
    should calculate an item total price (with valid products using values [price: 3000, quantity: 3, expecting total to be: 9000]) - 1 ms
    should calculate an item total price (with valid products using values [price: 1500, quantity: 5, expecting total to be: 7500]) - 1 ms

<h2 id="fake-data">Generando datos de prueba</h2>

Crear los valores para los proveedores de datos es una tarea tediosa que podemos evitar usando un generador de datos como
[Fake][25]. Podemos poner de ejemplo un spec para el módulo `ProductsCatalog` donde queremos generar productos para
verificar que podemos encontrarlos por su ID. En el ejemplo creamos una función `buildProducts` que crea productos
con ID y nombres aleatorios (100 productos en nuestro spec). Esos datos se usan para verificar que un producto se puede
encontrar por ID.

~~~javascript
define(['store/ProductsCatalog'], function(ProductsCatalog) {
    var faker, catalog;
    var buildProducts = function(amount) {
        var i, products = [];

        for (i = 1; i <= amount; i++) {
            products[i] = {productId: faker.Helpers.randomNumber(10), name: faker.Lorem.words(2)};
        }

        return products;
    };

    beforeEach(function () {
        catalog = new ProductsCatalog();
        faker = require('Faker');
    });

    describe('ProductsCatalog', function () {

        it('should find a product by its identifier', function () {
            var products = buildProducts(100);
            var expectedProduct = products[5]; // Fifth product
            var product;

            catalog.setProducts(products);

            product = catalog.productOfId(expectedProduct.productId);

            expect(product.productId).toEqual(expectedProduct.productId);
            expect(product.name).toEqual(expectedProduct.name);
        });
    });
});
~~~

Espero que este post te sea de utilidad para realizar testing a componentes Flight y módulos en general. Si tienes algun
comentario lo agradeceré mucho. Puedes revisar el código completo en este repo en [Github][26]. Si al probar el código
algo no funciona y necesitas ayuda por favor deja tu pregunta [aquí][19] así más gente puede ayudarte y más se
beneficiarán con la respuesta.

[1]: http://www.montealegreluis.com/blog/2014/11/23/aplicaciones-desacopladas-con-flight-js/
[2]: http://yeoman.io/
[3]: https://github.com/flightjs/generator-flight
[4]: http://bower.io/
[5]: http://npmjs.org/
[6]: http://karma-runner.github.io/0.12/index.html
[8]: http://phantomjs.org/
[9]: http://codeception.com/docs/04-AcceptanceTests
[10]: http://codeception.com/05-13-2013/phantom-js-headless-testing.html
[11]: https://github.com/tmpvar/jsdom
[12]: https://www.npmjs.org/package/jquery/
[13]: http://requirejs.org/
[14]: https://github.com/mhevery/jasmine-node
[15]: https://github.com/velesin/jasmine-jquery
[16]: http://jasmine.github.io/2.0/introduction.html
[17]: https://github.com/flightjs/jasmine-flight
[18]: https://github.com/MontealegreLuis/jasmine-flight/tree/no_browser
[19]: https://github.com/MontealegreLuis/flight-demo/blob/master/specs-runner.js
[20]: http://xunitpatterns.com/Fake%20Object.html
[21]: http://xunitpatterns.com/Test%20Spy.html
[22]: https://github.com/junit-team/junit/wiki/Test-fixtures
[23]: http://blog.jphpsf.com/2012/08/30/drying-up-your-javascript-jasmine-tests
[24]: http://softwarechaos.wordpress.com/2013/03/03/using-dataprovider-for-jasmine/
[25]: https://github.com/FotoVerite/Faker.js
[26]: https://github.com/MontealegreLuis/flight-demo
