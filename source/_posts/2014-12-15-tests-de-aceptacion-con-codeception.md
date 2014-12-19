---
title: Tests de aceptación con Codeception
tags:
    - Codeception
    - Testing
    - Alice
categories:
    - PHP
use:
    - posts_categories
---
Este post es una continuación al post de [Testing de componentes Flight][1], que trataba de una aplicación ficticia para
la compra de productos, donde desarrollamos los specs para los componentes de Flight usando Jasmine. La configuración
para los tests era un poco más complicada que la que se genera normalmente con [Yeoman][2]. El objetivo era evitar el
uso del navegador para ejecutar nuestros specs, porque las pruebas con un navegador van incluidas en las pruebas de
aceptación que podemos escribir con un framework de pruebas como [Codeception][3].

En este post desarrollaremos las siguientes tareas:

* Configurar Codeception para ejecutar tests headless usando [PhantomJS][6]
* Generar fixtures de datos para nuestras pruebas usando [Alice][4] y [Faker][5]
* Escribir una prueba de aceptación para nuestra aplicación de muestra

## Configuración de Codecception

Codeception es un framework de pruebas para PHP cuyo objetivo es crear tests legibles que describan acciones desde la
perspectiva del usuario.

Instalaremos Codeception usando Composer. Codeception proporciona una interfaz de línea de comando que por default se
instala en  `vendor/bin/codecept`. Nosotros modificaremos nuestro archivo `composer.json` para que quede instalado en
`bin/codecept`.

~~~json
"config": {
    "bin-dir": "bin/"
}
~~~

Una vez configurado agregamos el paquete de Codeception como una dependencia de desarrollo.

~~~bash
$ composer require --dev codeception/codeception
~~~

Después de instalar podemos inicializar nuestro ambiente de pruebas con el siguiente comando:

~~~php
$ php bin/codecept bootstrap
~~~

Como Codeception nos permite hacer pruebas de aceptación, funcionales y unitarias, este comando crea la siguiente
estructura de directorios. Cada tipo de prueba esta separada en suites. En lo personal uso Codeception únicamente para
pruebas de aceptación. Así que lo siguiente que hago, por lo general, es eliminar todos los archivos que no están
relacionados con ese tipo de pruebas.

```
tests/
├── acceptance
│   ├── AcceptanceTester.php
│   └── _bootstrap.php
├── acceptance.suite.yml
├── _bootstrap.php
├── _data
│   └── dump.sql
├── functional
│   ├── _bootstrap.php
│   └── FunctionalTester.php
├── functional.suite.yml
├── _output
├── _support
│   ├── AcceptanceHelper.php
│   ├── FunctionalHelper.php
│   └── UnitHelper.php
├── unit
│   ├── _bootstrap.php
│   └── UnitTester.php
└── unit.suite.yml
```

### Algunos conceptos básicos

#### Actores

Ya que las pruebas se representan como acciones realizadas por un usuario, un **actor** es un objeto que representa a
una persona realizando pruebas a nuestra aplicación. En nuestro caso trabajaremos con el actor `AcceptanceTester`. Las
clases que representan a los actores se generan a partir de la configuración de cada suite.

Si modificamos la configuración de alguna suite podemos actualizar la definición de nuestros actores con el comando:

~~~bash
$ php bin/codecept build
~~~

#### Escenarios

Por defecto las pruebas en codeception se escriben como escenarios narrativos. Para crear un escenario debemos crear un
archivo con el sufijo `Cept`. Podemos crear una prueba usando el comando:

~~~bash
$ php bin/codecept generate:cept acceptance ShoppingCart
~~~

La prueba más simple consiste en pasar a nuestro actor un escenario.

~~~php
<?php
# tests/acceptance/ShoppingCartCept.php

$I = new AcceptanceTester($scenario);
?>
~~~

Existe otro tipo de formato para las pruebas llamado `Cest`, el cual es mi preferido. Un test del tipo `Cest` agrupa
nuestras pruebas en clases. Podemos crear un `Cest` con el comando:

~~~bash
$ php bin/codecept generate:cest acceptance ShoppingCart
~~~

Este comando genera una clase como la siguiente:

~~~php
<?php
# tests/acceptance/ShoppingCartCest.php

class ShoppingCartCest
{
    public function _before(AcceptanceTester $I)
    {
    }

    public function _after(AcceptanceTester $I)
    {
    }

    // tests
    public function tryToTest(AcceptanceTester $I)
    {
    }
}
~~~


Cada método públic en un Cest (excepto por los que inician con `_`) se ejecutarán como una prueba y recibirán como
argumento un objeto actor y un escenario como segundo argumento.

Los métoodos `_before` y `_after` son los equivalentes del `setUp` y `tearDown` en PHPUnit y se ejecutan antes y después
de cada test respectivamente.

### Configuración de la suite

Para nuestras pruebas usaremos el navegador headless de PhantomJS en el modo ghostdriver, para lo cual debemos modificar
el archivo de configuración.

~~~yaml
# tests/acceptance.suite.yml
class_name: AcceptanceTester
modules:
    enabled:
        - WebDriver
        - AcceptanceHelper
    config:
        WebDriver:
            url: 'http://shoppingcart.dev/'
            browser: phantomjs
~~~

Por último, usaremos [Grunt][9] para ejecutar las pruebas. Debes instalar de forma global Grunt con npm.

~~~bash
$ npm install -g grunt-cli
~~~

Una vez que tenemos la instalación global de Grunt es necesario agregarlo también a nuestro archivo `packages.json`
junto con PhantomJS y un par de tareas que nos servirán para ejecutar nuestros tests.

~~~json
{
  "devDependencies": {
    "grunt": "~0.4",
    "grunt-run": "~0.3",
    "grunt-exec": "~0.4",
    "phantomjs": "~1.9"
  }
}
~~~

En nuestro archivo `Gruntfile.js` registramos una nueva tarea que inicie PhantomJS, ejecute los tests y por último
detenga PhantomJS.

~~~javascript
module.exports = function(grunt) {
    var phantomjs = require('phantomjs');
    var phantombin = phantomjs.path;

    grunt.initConfig({
        exec: {
            codecept: {
                stdout: true,
                command: [
                    'php bin/codecept clean',
                    'php bin/codecept run web --steps'
                ].join('&&')
            }
        },
        run: {
            phantomjs: {
                options: {
                    wait: false,
                    quiet: true,
                    ready: /running on port/
                },
                cmd: phantombin,
                args: [
                    '--webdriver=4444'
                ],
            }
        }
    });

    grunt.loadNpmTasks('grunt-exec');
    grunt.loadNpmTasks('grunt-run');

    grunt.registerTask('default', []);

    grunt.registerTask('test', ['run:phantomjs', 'exec:codecept', 'stop:phantomjs']);
};
~~~

Una vez configurado todo podemos correr nuestro `Cest` con el comando:

~~~bash
$ grunt test
~~~

Como nuestro test está vacío debemos ver un resultado similar al siguiente:

~~~bash
Acceptance Tests (1) -------------------------------------------------------------------------
Trying to try to test (ShoppingCartCest::tryToTest)
Scenario:
 PASSED
~~~

## Primero los fixtures

Para nuestros test de aceptación necesitamos crear unos [fixtures][10] de datos con Alice. Alice nos permite generar
fixtures con datos ficticios para nuestras pruebas, usando archivos YAML. Podemos instalar Alice con Composer.

~~~bash
$ composer require --dev nelmio/alice
~~~

Alice cuenta con una integración con [Doctrine ORM][11], sin embargo, para mantener nuestro ejemplo simple, nuestro
proyecto solo usa [PDO][12]. Nuestra clase producto es la siguiente:

~~~php
class Product
{
    protected $productId;
    protected $name;
    protected $unitPrice;

    public function __construct($productId, $name, $unitPrice)
    {
        $this->prductId = $productId;
        $this->name = $name;
        $this->unitPrice = $unitPrice;
    }

    public function productId()
    {
        return $this->productId;
    }

    public function name()
    {
        return $this->name;
    }

    public function unitPrice()
    {
        return $this->unitPrice;
    }
}
~~~

Nuestra clase `ProductCatalog` es la encargada de persistir nuestra información. Para mantener el ejemplo simple, usamos
[SQLite][13].

~~~php
class ProductCatalog
{
    protected $connection;

    public function __construct(PDO $connection)
    {
        $this->connection = $connection;
    }

    public function add(Product $product)
    {
        $sql = 'INSERT INTO products(product_id, name, unit_price) VALUES (?, ?, ?)';
        $statement = $this->connection->prepare($sql);
        $statement->execute([
            $product->productId(),
            $product->name(),
            $product->unitPrice(),
        ]);
    }
}
~~~

Para mantener el código de nuestras rutas de Slim limpio, registramos la conexión a la base de datos y nuestro catálogo
como servicios en el componente de [inyección de dependencias de Slim][14].

~~~php
# app/resources.php

$app->container->singleton('connection', function() {
    $connection = new PDO('sqlite:var/store.sqlite');
    $connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $connection->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    return $connection;
});

$app->container->singleton('catalog', function() use ($app) {

    return new ProductCatalog($app->connection);
});
~~~

Para cargar los datos de nuestros fixtures crearemos una clase que utilice la misma conexión que definimos en nuestra
aplicación de Slim.

~~~php
# tests/support/FixturesLoader.php

use Slim\Slim;

class FixturesLoader
{
    protected $connection;

    public function __construct()
    {
        $app = new Slim();
        require __DIR__ . '/../../app/resources.php';

        $this->connection = $app->connection;
    }

    public function connection()
    {
        return $this->connection;
    }
}
~~~

La clase `Loader\Yaml` de Alice creará nuestras entidades usando [Reflection][15], así que para nuestro ejemplo, la
variable `$entities` será un arreglo de objetos `Product`. El segundo argumento de el método `loadFixture` es un objeto
que nos permitirá guardar los datos de las entidades en la base de datos, en nuestro caso, un objeto de la clase
`ProductCatalog`.

~~~php
use Nelmio\Alice\Loader\Yaml;

class FixturesLoader
{
    // ...

    public function loadFixture($fixture, $persister)
    {
        $loader = new Yaml();
        $entities = $loader->load($fixture);

        array_map(function($entity) use ($persister) {
            $persister->add($entity);
        }, $entities);
    }
}
~~~

Cómo nuestros tests se ejecutarán muchas veces, necesitamos de un método que nos permita eliminar los datos que se
generaron en pruebas anteriores.

~~~php
class FixturesLoader
{
    // ...

    public function purge($table)
    {
        $statement = $this->connection->prepare(sprintf('DELETE FROM %s', $table));
        $statement->execute();
    }
}
~~~

Ahora que tenemos nuestra clase para cargar fixtures, la podemos usar en el método `_before` de nuestro `Cest`

~~~php
# tests/acceptance/ShoppingCartCest.php

class ShoppingCartCest
{
    /** @type FixturesLoader */
    protected $loader;

    public function _before()
    {
        $this->loader = new FixturesLoader();

        $this->loader->purge('products');
        $this->loader->loadFixture(
            __DIR__ . '/../_data/fixtures/products.yml',
            new ProductCatalog($this->loader->connection())
        );
    }

    // ...
}
~~~

### ¿Y los fixtures?

Por último debemos generar el archivo `.yml` con los datos de prueba. Lo primero que necesita nuestro archivo es el nombre
de la clase, cada entrada después del nombre de la clase representa un objeto de esa clase. Debemos colocarles un nombre
para poder identificarlos después, en caso que se usen como referencias en otros objetos.

~~~yaml
# tests/_data/fixtures/products.yml

Store\Product:
    product0:
        __construct: false # Do not use the constructor
        productId: 1
        name: Tetris
        unitPrice: 100.20
    product1:
        __construct: false
        productId: 2
        name: Minecraft
        unitPrice: 200.80
~~~

Aunque resulta relativamente simple generar datos manualmente, una mejor opción es la generación automática. Para este
fin, Alice usa los proveedores de datos de Faker. Para usar un [proveedor de Faker][16] solo es necesario usar el nombre
del método y sus argumentos, cuando sea necesario, después de la priopiedad del objeto en nuestro archivo YAML. En el
ejemplo estamos usando también rangos `product{2..12}` para generar de forma automática los identificadores de los
objetos, en este caso serán desde `product2` hasta `product12`.

~~~yaml
Store\Product:
    product{2..12}:
        __construct: false
        productId (unique): <numberBetween(1, 20)>
        name: <sentence(2)>
        unitPrice: <randomFloat(2, 5, 100)>
~~~

Si ejecutamos nuevamente nuestro test y hacemos una consulta a nuestra tabla de productos, veremos una salida similar a
la siguiente:

<img src="/images/content/alice-faker-data.png" class="img-responsive img-thumbnail center-block" alt="Datos de prueba de Alice y Faker">

Podemos generar nuestro propio proveedor de datos aleatorios para hacer que todos nuestros productos sean videojuegos.
Un proveedor no requiere de nada particular, los método publicos del proveedor que registremos con Alice estarán
disponibles desde nuestro archivo de fixtures.

~~~php
# tests/support/ProductsProvider.php

class ProductsProvider
{
    protected $products = [
        'Super Mario Bros',
        'Grand Theft Auto',
        'Call of Duty',
        'Mario Kart',
        'Pokémon Diamond and Pearl',
        'Sonic the Hedgehog',
        'Diablo III',
        'Battlefield 3',
        'Mortal Kombat II',
        'Street Fighter II: Special Champion Edition',
    ];

    public function product()
    {
        return $this->products[array_rand($this->products)];
    }
}
~~~

Para que funcione debemos pasar el proveedor a nuestro loader.

~~~php
# ShoppingCartCest::_before
$this->loader->loadFixture(
    __DIR__ . '/../_data/fixtures/products.yml',
    new ProductCatalog($this->loader->connection()),
    [new ProductsProvider()] // Our provider
);

# FixturesLoader::loadFixtures
public function loadFixture($fixture, $persister, $providers = [])
{
    $loader = new Yaml('en_US', $providers);
    // ...
}
~~~

Y utilizarlo en nuestro archivo de fixtures.

~~~yaml
product{2..12}:
    __construct: false
    productId (unique): <numberBetween(3, 20)>
    name: <product()>
    unitPrice: <randomFloat(2, 5, 100)>
~~~

Los datos generados ahora, serían similares a los siguientes:

<img src="/images/content/datos-con-proveedor-de-faker.png" class="img-responsive img-thumbnail center-block" alt="Datos de proveedor de Faker">

## Las pruebas de aceptación (por fin...)

El objetivo de las pruebas es que describan las acciones como si fueran realizadas por un usuario de la aplicación. Para
ese fin codeception nos proporciona algunos métodos para describir el objetivo de cada prueba similar al formato
[Connextra][18].

~~~php
$I->am('videogames buyer');
$I->wantTo('buy my favorite videogames');
$I->lookForwardTo('add videogames to my shopping cart');
~~~

Estos pasos mostraran una salida más descriptiva que nos permite saber cuál es el propósito de nuestro test.

~~~bash
Trying to buy my favorite videogames (ShoppingCartCest::toAddProductsToMyShoppingCart)
Scenario:
* As a videogames buyer
* So that I add videogames to my shopping cart
~~~

A fin de evitar colocar código CSS o XPath directamente en nuestros tests, Codeception cuenta con una implementación del
patrón de diseño [PageObject][17] que representa una página Web como una clase y los elementos del DOM como sus
propiedades.

~~~bash
$ php bin/codecept generate:pageobject ShoppingCartPage
~~~

En nuestra página de carrito los elementos DOM que nos interesan son: el `select` con los productos, el `text` con la
cantidad de productos a comprar, el botón para agregar el producto. También es importante verificar que se actualicen
los valores del precio total del producto seleccionado (precio unitario multpilicado por la cantidad) y la celda con el
total a pagar por los productos seleccionados.

~~~php
class ShoppingCartPage
{
    public static $URL = '/order';
    public static $product = 'Product';
    public static $quantity = 'Quantity';
    public static $addToCart = 'Add to cart';
    public static $firstItemPrice = '//tbody//tr[1]//td[last()]';
    public static $secondItemPrice = '//tbody//tr[2]//td[last()]';
    public static $total = '#cart-total';
}
~~~

Nuestra prueba agregaría 5 copias de Tetris que nos da un total de $501.50 ($100.21 cada uno) y dos copias de Minecraft
$401.66 ($200.83 cada uno). El total que debe tener nuestro carro de compra es de $902.71.

~~~php
public function tryToAddProductsToMyShoppingCart(AcceptanceTester $I)
{
    $I->am('videogames buyer');
    $I->wantTo('buy my favorite videogames');
    $I->lookForwardTo('add videogames to my shopping cart');

    $I->amOnPage(ShoppingCartPage::$URL);
    $I->selectOption(ShoppingCartPage::$product, 'Tetris');
    $I->fillField(ShoppingCartPage::$quantity, 5);
    $I->click(ShoppingCartPage::$addToCart);

    $I->see(501.05, ShoppingCartPage::$firstItemPrice);

    $I->selectOption(ShoppingCartPage::$product, 'Minecraft');
    $I->fillField(ShoppingCartPage::$quantity, 2);
    $I->click(ShoppingCartPage::$addToCart);

    $I->see(401.66, ShoppingCartPage::$secondItemPrice);

    $I->see(902.71, ShoppingCartPage::$total);
}
~~~

De las cosas más interesantes que nos ofrece Codeception es su simpleza, ya que podemos leer cada línea de nuestro test
casi como una oración en ingles. Por ejemplo:

`$I->amOnPage(ShoppingCartPage::$URL);` estoy en la página del carrito de compras (`/order`),
`$I->selectOption(ShoppingCartPage::$product, 'Tetris');` selecciono la opción Tetris de los
productos, `$I->fillField(ShoppingCartPage::$quantity, 5);` y lleno el campo cantidad con un 5,
`$I->click(ShoppingCartPage::$addToCart);` cuando doy clic en el botón agregar al carrito,
`$I->see(501.05, ShoppingCartPage::$firstItemPrice);` debería ver el valor 501.05 en el precio total del producto
(última celda de la primera fila de la tabla).

Con esta prueba estamos validando también el correcto funcionamiento de nuestro componentes de Flight, razón por la cuál
en el post anterior, no escribimos las pruebas usando Karma. El código de este ejemplo lo desarrollé en una máquina
virtual generada con [PuPHPet][19], razón por la que describí como ejecutar las pruebas usando PhantomJS. Sólo que hay
un pequeño detalle que encontré. PhantomJS no tiene soporte para la función `bind` de JavaScript, debido a la versión
de QtWebKit en la que está basado, y al parecer no tendrá solución hasta la versión 2 como se explica en este
[issue][20]. Podemos usar algunos polyfills para solucionar el problema, en el [repo de este ejemplo][21] puedes ver
como se incluye de manera condicional un [snippet][22] de código que tomé de las respuestas en el issue cuando estamos
en el ambiente de testing. Es importante señalar que este snippet en nuestro template sólo tiene sentido si usamos
PhantomJS, no lo necesitamos con ningún otro navegador.

Espero que este post te haya servido para darte una mejor idea de como funciona el testing de aceptación con Codeception
y como complementa los otros tipos de testing que revisamos en posts anteriores. Agradeceré mucho tus sugerencias,
críticas y quejas en los comentarios.

[1]: http://www.montealegreluis.com/blog/2014/11/23/testing-de-componentes-flight/
[2]: https://github.com/flightjs/generator-flight
[3]: http://codeception.com
[4]: https://github.com/nelmio/alice
[5]: https://github.com/fzaninotto/Faker
[6]: http://phantomjs.org/
[7]: http://docs.seleniumhq.org/projects/webdriver/
[8]: http://phantomjs.org/download.html
[9]: http://gruntjs.com/
[10]: http://en.wikipedia.org/wiki/Test_fixture
[11]: http://www.doctrine-project.org/projects/orm.html
[12]: http://php.net/manual/es/book.pdo.php
[13]: http://www.sqlite.org/
[14]: http://docs.slimframework.com/#DI-Overview
[15]: http://php.net/manual/es/intro.reflection.php
[16]: https://github.com/fzaninotto/Faker#formatters
[17]: https://code.google.com/p/selenium/wiki/PageObjects
[18]: http://blog.firsthand.ca/2010/08/user-story-format.html
[19]: https://puphpet.com/
[20]: https://github.com/ariya/phantomjs/issues/10522
[21]: https://github.com/MontealegreLuis/flight-demo
[22]: https://github.com/MontealegreLuis/flight-demo/blob/master/app/templates/order.html.twig#L56
