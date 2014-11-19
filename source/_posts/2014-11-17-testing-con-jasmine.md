---
title: Testing con Jasmine
tags:
    - Testing
    - Jasmine
    - jQuery
    - RequireJS
categories:
    - JavaScript
use:
    - posts_categories
---
Recientemente encontré un [artículo][1] que trataba sobre como separar el código JavaScript de modo que podamos hacer
pruebas unitarias a código que involucre la manipulación de [DOM][2] y solicitudes [XHR][3]. Me di cuenta de lo poco que
se sobre testing y código desacoplado en JavaScript y me decidí a escribir un ejemplo.

El ejemplo trata de los clásicos `selects` encadenados, donde al seleccionar un valor del primer `select` se
actualizan los valores del segundo, usando la típica relación estados-ciudades.

El código que generalmente escribimos para tener este comportamiento es más o menos así:

~~~html
<form role="form">
    <!-- ... -->
</form>
<script>
    $('#states').on('change', function() {
        var optionTemplate = '<option value="{value}">{label}</option>';
        var options='', i, citiesCount;

        $.ajax({
            url: '/app/cities.json',
            dataType: 'json',
            data: {'state': $(this).val()},
            success: function(cities) {
                citiesCount = cities.length
                for (i = 0; i < citiesCount; i++) {
                    options += optionTemplate
                        .replace('{value}', cities[i].value)
                        .replace('{label}', cities[i].label);
                }
                $('#cities').html(options);
            }
        });
    });
</script>
~~~

Para simplificar el ejemplo, `/app/cities.json` es un archivo con extensión `.json` que tiene un contenido similar al
siguiente.

~~~json
[
    // ..
    {
        "value": "114",
        "label": "Puebla"
    },
    // ..
    {
        "value": "207",
        "label": "Zacapoaxtla"
    }
]
~~~

## Problemas

Este código si bien no es difícil de entender, resulta muy difícil de testear. El primero de los problemas
que encontramos es que el código JavaScript está dentro del HTML y resulta imposible testearlo por separado. Segundo
aunque estuviera en un archivo separado no cuenta con una interfaz pública que podamos validar a través de pruebas.
Un punto más en contra es que tampoco es posible hacer pruebas a las funciones anónimas que utiliza. Además el uso de
manejadores de eventos que actualizan el DOM es una muestra de la mezcla de responsabilidades dentro del código.
Para terminar, el uso de solicitudes XHR sin un mecanismo que nos permita saber cuando terminaron su ejecución,
complica aún más las cosas.

## Separando responsabilidades

Podemos comenzar reemplazando el código que genera HTML concatenando cadenas, por una librería de plantillas que genere
los elementos `option` de nuestro select. Para nuestro ejemplo usaremos [Twig.js][5] que es una implementación en
JavaScript de [Twig][6].

Para generar los elementos `option` con Twig usamos una plantilla que itera sobre los resultados que nos devuelve
nuestra llamada AJAX generando nuestros elementos `option`.

~~~twig
{ % for city in cities % }
    <option value="{ { city.value } }">{ { city.label } }</option>
{ % endfor % }
~~~

Para poder usar la plantilla debemos cargarla primero.

~~~javascript
twig({href: '/js/app/templates/cities.html.twig', id: 'cities', async: false});
twig({ref: 'cities'}).render({cities: cities});
~~~

Así nuestra llamada AJAX quedaría de la siguiente forma:

~~~javascript
$.ajax({
    url: '/app/cities.json',
    dataType: 'json',
    data: {'state': $(this).val()},
    success: function(cities) {
        twig({href: '/js/app/templates/cities.html.twig', id: 'cities', async: false});
        $('#cities').html(twig({ref: 'cities'}).render({cities: cities}));
    }
});
~~~

El siguiente paso es convertir la función anónima que se ejecuta al finalizar la solicuitud AJAX (`success`) en un
[módulo][4]. Con esto comenzaremos a dar una interfaz pública a nuestro código para poder testearlo por separado.

~~~javascript
var ShippingForm = function($city, view) {
    'use strict';

    this.refreshOptions = function(cities) {
        $city.html(view({ref: 'cities'}).render({cities: cities}));
    };

    return this;
};
~~~

Así en lugar de usar una función anónima podemos usar `ShippingForm.refreshOptions` como [callback][7].

~~~javascript
var form = new ShippingForm($('#cities'), twig);

$.ajax({
    url: '/app/cities.json',
    dataType: 'json',
    data: {'state': $(this).val()},
    success: form.refreshOptions
});
~~~

La lógica relacionada con el evento `change` de nuestro `select` de estados también es una función anónima que podemos
mover dentro de nuestro módulo (`ShippingForm.getCities`).

~~~javascript
var ShippingForm = function($city, view, $state, $, citiesUrl, refreshOptions) {
    'use strict';

    var form = this;

    //...

    this.getCities = function() {
        var stateId = $state.val();

        if (!stateId) {
            return;
        }

        refreshOptions = refreshOptions || form.refreshOptions;

        $.ajax({
            url: citiesUrl,
            dataType: 'json',
            data: {'state': stateId},
            success: refreshOptions
        });
    };
};
~~~

De nuevo reemplazamos la función anónima con el método `getCities` de nuestro módulo.

~~~javascript
var form = new ShippingForm($('#cities'), twig, $('#states'), $, '/app/cities.json');

$('#states').on('change', form.getCities);
~~~

Por útlimo podemos encapsular la asociación del evento `change` con el método `getCities` dentro de nuestro módulo, lo
cuál nos dará oportunidad de testear todo el código que teníamos al inicio. Es importante mencionar que estamos
[inyectando][8] todas nuestras dependencias (DOM y solictudes XHR) a fin de poder reemplazarlas por [dobles][9]
en nuestras pruebas.

~~~javascript
var ShippingForm = function($city, view, $state, $, refreshOptions) {
    //...
};

var form = new ShippingForm($('#cities'), twig, $('#states'), $);

form.init();
~~~

Nuestro siguiente paso es mover nuestro módulo a un archivo separado. Para esto utilizaré [RequireJS][10] que es un
`loader` de módulos y archivos, optimizado para trabajar en navegadores. RequireJS utiliza un solo archivo como punto
de entrada para nuestra aplicación, al cual generalmente se le nombra `main.js`.

~~~html
<script data-main="js/app/main" src="js/vendor/requirejs/require.js"></script>
~~~

El archivo `main.js` se usa para configurar las dependencias iniciales de nuestra aplicación, en nuestro caso
jQuery y Twig. También es el encargado de iniciar nuestra aplicación a través de un módulo escrito por nosotros llamado
`app`.

~~~javascript
require.config({
    paths: {
        'jquery': '../vendor/jquery/dist/jquery',
        'twig': '../vendor/twig.js/twig.min'
    },
    baseUrl: '/js/app'
});

require(['./app'], function(app) {
    app.init();
});
~~~

El módulo `app` hace la carga inicial de dependencias, incluidos nuestros módulos (`ShippingForm`).

~~~javascript
define(['twig', 'jquery', './src/ShippingForm'], function (view, $, ShippingForm) {
    'use strict';

    var app = {};

    app.init = function() {
        var form;

        view.twig({
            href: '/js/app/templates/cities.html.twig',
            async: false,
            id: 'cities'
        });

        form = new ShippingForm($, $('#states'), $('#cities'), view, '/app/cities.json');
        form.init();
    };

    return app;
});
~~~

## Escribiendo los tests

Para las pruebas usaré [Jasmine][11] que es un framework para testing del tipo [BDD][12] que se destaca por tener una
sintaxis muy fácil de entender. Jasmine utiliza suites, que son un conjunto de casos de pruebas llamados specs.

Usaremos [npm][13] para instalar las dependencias. `npm` utiliza el archivo `package.json` para determinar cuales son
las dependencias a instalar.

~~~json
{
  "name": "@montealegreluis/testing",
  "license": "MIT",
  "devDependencies": {
    "jasmine-node": "~1.14",
    "requirejs": "~2.1"
  },
  "scripts": {
    "test": "node ./specs-runner.js"
  }
}
~~~

Una vez definidas nuestras dependencias (Jasmine y RequireJS), las instalamos.

~~~bash
$ npm install
~~~

Para poder ejecutar nuestras pruebas, necesitamos configurar Jasmine y RequireJS para que funcionen de manera similar a
como funcionan en un navegador, para esto necesitamos un [runner][18] especial, el cual está basado en la configuración
de este repo de [Zaworski][14].

Con este archivo (el cuál se configura en la llave `scripts` del archivo `package.json`) podemos ya ejecutar nuestros
tests desde la consola usando `npm`

~~~bash
$ npm test
~~~

Nuestra suite verifica los métodos del módulo `ShippingForm`. Para esto debemos crear el archivo
`js/app/spec/ShippingForm.spec.js`. Nuestro primer spec verifica que se inicialice correctamente el evento `change`
de nuestro `select` de estados. Para esto creamos un doble del tipo [spy][15] para nuestro elemento `$state` que
verifica que se llame al método `on` con los parámetros correctos.

~~~javascript
define(['src/ShippingForm'], function(ShippingForm) {
    'use strict';

    describe('ShippingForm', function () {
        it('should initialize onchange event', function () {
            var $state = jasmine.createSpyObj('state', ['on']);
            var form = new ShippingForm({}, $state);

            form.init();

            expect($state.on).toHaveBeenCalledWith('change', form.getCities);
        });
    });
});
~~~

Nuestro segundo spec verifica que si el valor del elemento seleccionado en nuestro `select` es vacío, la llamada AJAX
no se ejecute. En esta ocasión se crea un [stub][16] para `$state` que nos devuelva una cadena vacía, que nos permita
 verificar en el spy para `$` que el método `ajax` no se llamó.

~~~javascript
it('should skip getting the cities if there is no current state selected', function () {
    var $state = {
        val: function() {}
    };
    var $ = jasmine.createSpyObj('$', ['ajax']);
    var form = new ShippingForm($, $state);

    spyOn($state, 'val').andReturn('');

    form.getCities();

    expect($state.val).toHaveBeenCalled();
    expect($.ajax).not.toHaveBeenCalled();
});
~~~

Nuestro siguiente spec verifica que si se selecciona un valor no vacío en el `select` de estado, se realice la llamada
AJAX que devuelva las ciudades. Para esto creamos un spy de la función `refreshOptions` para verificar que se llame al
callback de éxito al terminar la solicitud AJAX, también necesitamos un stub de `$state` para que devuelva un valor no
vacío y que el spy de `$` ejecute el método `ajax`.

~~~javascript
it('should get the cities when a state is selected', function () {
    var $state = {
        val: function() {}
    };
    var $ = {
        ajax: function(options) {
            options.success.call();
        }
    };
    var refreshOptions = jasmine.createSpy('refreshOptions');
    var form = new ShippingForm($, $state, {}, {}, '/app/cities.json', refreshOptions);

    spyOn($state, 'val').andReturn('21');
    spyOn($, 'ajax').andCallThrough();

    form.getCities();

    expect($state.val).toHaveBeenCalled();
    expect($.ajax).toHaveBeenCalled();
    expect(refreshOptions).toHaveBeenCalled();
});
~~~

Por último verificamos que el método `refreshOptions` de nuestro módulo funcione correctamente. Para esto creamos un spy
de `twig` y un spy de `$city` para verificar las llamadas a los métodos `render` y `html` respectivamente.

~~~javascript
it('should refresh the cities options', function () {
    var $city = jasmine.createSpyObj('city', ['html']);
    var view = {
        twig: function() {
            return {
                render: function() {}
            };
        }
    }
    var form = new ShippingForm({}, {}, $city, view, '/app/cities.json');

    spyOn(view, 'twig').andCallThrough();

    form.refreshOptions([{value: 12, label: 'Puebla'}]);

    expect($city.html).toHaveBeenCalled();
    expect(view.twig).toHaveBeenCalled();
});
~~~

Espero que este post te sea de utilidad para realizar testing a código JavaScript. Si tienes algun comentario lo
agradeceré mucho. Puedes revisar el código completo en este repo en [Github][17]. Si al probar el código algo no
funciona y necesitas ayuda por favor deja tu pregunta [aquí][19] así más gente puede ayudarte y más se beneficiarán
con la respuesta.

[1]: https://shanetomlinson.com/2013/testing-javascript-frontend-part-1-anti-patterns-and-fixes/
[2]: http://es.wikipedia.org/wiki/Document_Object_Model
[3]: http://es.wikipedia.org/wiki/XMLHttpRequest
[4]: http://addyosmani.com/resources/essentialjsdesignpatterns/book/#modulepatternjavascript
[5]: https://github.com/justjohn/twig.js/
[6]: http://twig.sensiolabs.org/
[7]: http://javascriptissexy.com/understand-javascript-callback-functions-and-use-them/
[8]: http://es.wikipedia.org/wiki/Inyecci%C3%B3n_de_dependencias
[9]: http://en.wikipedia.org/wiki/Test_double
[10]: http://requirejs.org/
[11]: http://jasmine.github.io/
[12]: http://en.wikipedia.org/wiki/Behavior-driven_development
[13]: https://www.npmjs.org/
[14]: https://github.com/rjz/jasmine-require-coffee-backbone-node
[15]: http://xunitpatterns.com/Test%20Spy.html
[16]: http://xunitpatterns.com/Test%20Stub.html
[17]: https://github.com/MontealegreLuis/jstesting
[18]: https://github.com/MontealegreLuis/jstesting/blob/master/specs-runner.js
[19]: http://preguntas.hfpuebla.org/
