---
title: Módulos con Slim
tags:
    - PHP
    - Slim
    - Módulos
categories:
    - PHP
use:
    - posts_categories
---
Uno de los conceptos más importantes que nos permite reusar código entre aplicaciones
es el de **módulo**. Cada framework popular en PHP tiene su propia forma de estructurar
módulos, e incluso distintas formas de nombrarlos. Por ejemplo en Zend Framework 2
son [módulos][1], en Symfony 2 son [bundles][2] y en Laravel 4 son [packages][3].

Slim al ser un microframework no cuenta con un concepto de módulo como tal, ya que su
escencia es que puedes usar funciones anónimas como controladores y desarrollar
aplicaciones de la forma más simple posible.

Aún así, si te interesa organizar el código de una aplicación mediana de forma similar
a como lo harías en un framework regular, este post será de tu interés.

Te explicaré cómo puedes usar el paquete `comphppuebla/slim-modules` para estructurar
tus aplicaciones Slim de forma similar a como lo harías con módulos. Para esto usaré
el ejemplo que he venido usando en post anteriores sobre una aplicación de catálago
de productos.

## Estructurando el Módulo

Supongamos que tienes una estructura de directorios similar a la siguiente para tu
proyecto.

```
src
├── ProductCatalogModule
│   ├── Controllers
│   │   ├── SearchProductsController.php
│   │   └── ProductRequest.php
│   ├── Resources
│   │   └── templates
│   │       └── search-products.html.twig
│   ├──Forms
│   │  └── ProductForm.php
├── ProductCatalog
│   ├── Catalog.php
│   └──  Product.php
```

Y que queremos integrar de la forma más simple posible ese código con nuestra aplicación
Slim.

## Instalación

Primero instalamos el paquete con Composer.

```bash
$ composer require comphppuebla/slim-modules
```

Puedes revisar la [documentación][7] y esta [aplicación][8] que ya usa el módulo, para más
detalles.

## Registrando los servicios

El paquete está pensado para integrar módulos, pero también puedes integrar librerías
de terceros, similar a los [services providers][4] de Silex. Supongamos que queremos
integrar Twig, podemos usar la interfaz `ComPHPPuebla\Slim\ServiceProvider` de la
siguiente forma:

```php
use ComPHPPuebla\Slim\ServiceProvider;

class TwigProvider implements ServiceProvider
{
    public function configure(Slim $app, array $parameters = [])
    {
        $app->container->singleton('twig.loader', function() {
            return new Twig_Loader_Filesystem($parameters['twig.paths']);
        });
        $app->container->singleton('twig.environment', function() use ($app) {
            return new Twig_Environment(
                $app->container->get('twig.loader'),
                $parameters['twig.options']
            );
        });
    }
}
```

Una vez definido, puedes registrar tu proveedor en `index.php`

```php
$app = new Slim\Slim();

$twigProvider = new TwigProvider([
    'twig.paths' => [
        'app/templates'
        'src/ProductCatalogModule/Resources/templates',
    ],
    'twig.options' => [
        'cache' => 'var/cache/twig',
        'strict_variables' => true,
    ],
]);

$twigProvider->register($app);

$app->run();
```

## Registrando módulos

La implementación para los servicios de un módulo es similar, solo que registraríamos
controladores, repositorios, servicios de aplicación, formularios, etc. Por ejemplo:


```php
namespace ProductCatalogModule;

use ComPHPPuebla\Slim\ServiceProvider;
use ProductCatalogModule\Controllers;
use ProductCatalogModule\Forms;
use ProductCatalog\Catalog;

class ProductCatalogServices implements ServiceProvider
{
    public function configure(Slim $app, array $parameters = [])
    {
        $app->container->singleton(
            'product_catalog.search_products_controller',
            function() use ($app) {
                return new SearchProductsController(
                    $app->container->get('twig.environment'),
                    new SearchProductsForm(),
                    $app->container->get('product_catalog.product_repository'),
                );
            }
        );
        $app->container->singleton(
            'product_catalog.product_repository',
            function() use ($app) {
                return new new Catalog($app->container->get('dbal.connection'));
            }
        );
        /* more services here... */
    }
}
```

Registramos los servicios del módulo igual que hicimos con el ejemplo de Twig.

```php
$app = new Slim\Slim();

/* More providers here... */

$productCatalog = new ProductCatalogServices();
$productCatalog->register($app);

$app->run();
```

## Registrando las rutas

Para registrar las rutas, debemos crear una clase que implemente la interfaz
`ComPHPPuebla\Slim\ControllerProvider`

```php
namespace ProductCatalogModule;

use ComPHPPuebla\Slim\ControllerProvider;
use ComPHPPuebla\Slim\ControllerResolver;
use Slim\Slim;

class ProductCatalogControllers implements ControllerProvider
{
    public function register(Slim $app, ControllerResolver $resolver)
    {
        $app->map('/catalog/search', $resolver->resolve(
            $app, 'product_catalog.search_products_controller:searchProducts'
        ))->via('POST', 'GET');
        /* More routes here... */
    }
}
```

En el ejemplo, cada que la aplicación haga match con `/catalog/search` se ejecutará
el método `searchProducts` del servicio registrado con el nombre
`product_catalog.search_products_controller`. El objeto `ControllerResolver` usa el
patrón `id_controlador:metodo` para resolver qué método se ejecutará en cada ruta.
El controlador no se crea hasta que Slim hace match con esa ruta, el resolvedor
simplemente crea una función (similar a lo que sucede cuando ejecutas
`$app->container->protect`) que realiza las siguientes tareas:

* Genera un [callable][5] con el controlador y método que encontró a partir
de la cadena `id_controlador:metodo`.
* Recupera los argumentos que Slim genera a partir de la ruta, por ejemplo si la
ruta es `/products/:id`, recupera el valor de `$id` y lo pasa al método del controlador.
* Agrega el objeto `Request` como penúltimo argumento y a tu aplicación Slim como
último argumento. De modo que **todas** las llamadas a métodos de controladores tienen
por default **la misma estructura**:

```php
Controller::method(/* $route_param_1, ... $route_param_n */ $request, $app)
```

* Una vez que se resuelven los argumentos, se ejecuta el método del controlador

### Modificando argumentos

El resolvedor puede recibir como tercer argumento una función que altere los
parámetros que se le pasan a un controlador. Supongamos que tenemos un controlador
que edita los datos de un producto. El método en el controlador sólo necesita el
ID del producto y la instancia de la aplicación de Slim para llamar al método
`notFound` en caso de que no encontremos el producto asociado al ID proporcionado.
No nos hace falta en este caso el objeto `Request`.

```php
namespace ProductCatalogModule\Controllers;

/* ... */

class ProductController
{
    /* ... */

    public function editProduct($productId, Slim $app)
    {
        if (!$product = $this->catalog->productOf($productId)) {
            $app->notFound();
        }

        // Populate your form and pass it to the view
    }

    /* ... */
}
```

Si no usamos un convertidor de argumentos, generaríamos un error porque el
argumento que pasaríamos en segundo lugar sería de tipo `Request` y no de tipo
`Slim`, ya que ese es el comportamiento default.

Para evitar este error registramos un convertidor que elimine el `Request`
de nuestro arreglo de argumentos.

```php
# ProductCatalogModule\ProductCatalogControllers

public function register(Slim $app, ControllerResolver $resolver)
{
    $app->get('/catalog/product/edit/:id', $resolver->resolve(
        $app,
        'product_catalog.product_controller:editProduct',
        function (array $arguments) {
            // $arguments[0] is the product ID
            unset($arguments[1]); // Remove the request
            // $arguments[2] is our Slim application

            return $arguments;
        }
    ));

    /* ... */
}
```

### Reemplazando argumentos

Con los convertidores no solo podemos modificar los argumentos, los podemos
reemplazar completamente. Supongamos que tenemos un controlador para realizar
búsquedas de productos por categoría y palabras clave. Estos valores se pasan
usando el [query string][6] y en la aplicación son manejados usando el siguiente
objeto:

```php
namespace ProductCatalog;

class ProductSearchCriteria
{
    protected $category;
    protected $keywords;

    public function __construct($category = null, $keywords = null)
    {
        $this->category = $category;
        $this->keywords = $keywords;
    }

    public function hasCategory()
    {
        return !is_null($this->category);
    }

    public function category()
    {
        return $this->category;
    }

    public function hasKeywords()
    {
        return !is_null($this->keywords);
    }

    public function keywords()
    {
        return $this->keyword;
    }
}
```

Sin un convertidor de argumentos, nuestro controlador tendría código como este:

```php
namespace ProductCatalogModule\Controllers;

/* .. */

class SearchController
{
    /* ... */

    public function searchProducts(Request $request)
    {
        $results = $this->catalog->productsMatching(new ProductSearchCriteria(
            $request->get('category'), $request->get('keywords')
        ));

        // Pass your results to the view
    }
}
```

Con un convertidor podríamos pasar directamente el objeto `ProductSearchCriteria`
al método del controlador en lugar de pasar el objeto `Request`

```php
# ProductCatalogModule\ProductCatalogControllers

public function register(Slim $app, ControllerResolver $resolver)
{
    $app->get('/catalog/product/search', $resolver->resolve(
        $app,
        'product_catalog.product_search_controller:searchProducts',
        function (array $arguments) {
            // $arguments[0] is the request, our route does not have parameters

            return [new ProductSearchCriteria(
                $arguments[0]->get('category'), $arguments[0]->get('keywords')
            )];
        }
    ));

    /* ... */
}
```

Con este simple cambio, podemos modificar la firma del controlador.

```php
namespace ProductCatalogModule\Controllers;

/* .. */

class SearchController
{
    /* ... */

    public function searchProducts(ProductSearchCriteria $criteria)
    {
        $results = $this->catalog->productsMatching($criteria);

        // Pass your results to the view
    }
}
```

## Organizando todos tus servicios

En los ejemplos anteriores hemos registrado nuestros servicios por separado,
sin embargo, podemos incluir todas nuestras definiciones en una sola clase si
extendemos de `ComPHPPuebla\Slim\Services`.

Podemos registrar **todos** nuestros proveedores en el método `init` usando el
método `add`.

```php
namespace Application;

use ComPHPPuebla\Slim\Services;
use ProductCatalogModule\ProductCatalogServices;

class ApplicationServices extends Services
{
    /**
     * Add the providers for your modules here
     */
    protected function init()
    {
        $this
            ->add(new ProductCatalogServices())
            // Register more modules here...
            ->add(new TwigProvider())
            // Register more providers here...
        ;
    }
}
```

## Organizando todas tus rutas

También podemos agrupar el registro de las rutas en una sola clase
si extendemos de `ComPHPPuebla\Slim\Controllers`, también agregamos nuestros
controladores en el método `init` el cual se llama automáticamente al
registrar nuestras rutas.

```php
namespace Application;

use ComPHPPuebla\Slim\Controllers;
use ProductCatalogModule\ProductCatalogControllers;

class ApplicationControllers extends Controllers
{
    protected function init()
    {
        $this
            ->add(new ProductCatalogControllers())
            // Register more controllers modules here...
        ;
    }
}
```

Una vez agrupadas las definiciones de todos tus servicios y todas tus rutas,
la configuración en tu archivo `index.php` se reduce a algo similar a las
siguientes líneas.

```php
$app = new Slim\Slim();

$services = new Application\ApplicationServices();
$services->configure($app);

$controllers = new Application\ApplicationControllers();
$controllers->register($app);

$app->run();
```

Agradeceré mucho tus comentarios, dudas, quejas, sugerencias o reclamaciones.

[1]: http://framework.zend.com/manual/current/en/modules/zend.module-manager.intro.html
[2]: http://symfony.com/doc/bundles/
[3]: http://laravel.com/docs/4.2/packages
[4]: http://silex.sensiolabs.org/doc/providers.html
[5]: http://php.net/manual/es/language.types.callable.php
[6]: http://es.wikipedia.org/wiki/Query_string
[7]: http://comphppuebla.github.io/slim-modules/
[8]: https://github.com/MontealegreLuis/easy-forms-examples
