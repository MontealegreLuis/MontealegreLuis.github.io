---
title: Un formulario no tiene porque hacer todo
tags:
    - PHP
    - Forms
    - Twig
categories:
    - PHP
use:
    - posts_categories
---
Una de las tareas más comunes a las que nos enfrentamos como desarrolladores Web, es el
procesamiento de formularios.

En PHP existen varios paquetes que nos permiten trabajar con formularios, entre los más
populares están los componentes de [ZF2][1] y [Symfony2][2]. Sin embargo, creo que tienen sus
desventajas si queremos usarlos fuera de su respectivo framework. Ambos paquetes requieren de
varias dependencias que podrías no necesitar en tu proyecto. Estas son las dependencias que
instalas al requerir cualquiera de los dos paquetes:

<table class="table table-striped table-hover table-responsive">
    <tr>
        <th>Paquete</th>
        <th>Dependencias</th>
    </tr>
    <tr>
        <td><code>zendframework/zend-form</code></td>
        <td>
            <ul>
                <li><code>zend-stdlib</code></li>
                <li><code>zend-validator</code></li>
                <li><code>zend-filter</code></li>
                <li><code>zend-inputfilter</code></li>
            </ul>
        </td>
    </tr>
    <tr>
        <td><code>symfony/form</code></td>
        <td>
            <ul>
                <li><code>property-access</code></li>
                <li><code>options-resolver</code></li>
                <li><code>intl</code></li>
                <li><code>event-dispatcher</code></li>
            </ul>
        </td>
    </tr>
</table>

Me gusta el enfoque que usa Symfony2 ya que permite agregar funcionalidad, a través de
extensiones que permiten la integración con otros paquetes, por ejemplo: validación,
HTTP Foundation, Twig, etc. Aunque como puedes observar, tienes que instalar componentes
que tal vez no uses como el manejador de eventos o el componente de internacionalización.

En este post explicaré a través de ejemplos como creo que podríamos *desacoplar* de una mejor
forma el manejo de formularios y evitar instalar paquetes que tal vez no necesitemos,
además de simplificar las tareas rutinarias con formularios, *separando claramente las
diferentes responsabilidades relacionadas con formularios*, evitando así que el formulario
sepa hacer todo. Para esto revisaré la siguiente funcionalidad:

* Procesamiento
* Validación
* Integración con Twig
* Captchas y tokens CSRF
* Modificación dinámica de un formulario

Para los ejemplos usare el paquete [comphppuebla/easy-forms][3] que puedes instalar con Composer

```bash
$ composer require comphppuebla/easy-forms
```

## Procesamiento

Cuando procesamos un formulario solo necesitamos saber el nombre de los elementos en el formulario,
ya que esos nombres se mapean con las llaves en las variables superglobales `$_GET`, `$_POST` y
`$_FILES`. Las etiquetas HTML, los atributos HTML, los validadores, y mensajes de error no son
responsabilidad de los elementos o del formulario en sí, todas esas tareas corresponden a otros
componentes (validación y plantillas respectivamente).

La forma más simple de crear un formulario con este paquete es extendiendo de la clase
`EasyForms\Form`. Por ejemplo, si queremos un formulario para login tendríamos la siguiente clase.

```php
use EasyForms\Elements\Text;
use EasyForms\Elements\Password;
use EasyForms\Form;

class LoginForm extends Form
{
    public function __construct()
    {
        $this
            ->add(new Text('username'))
            ->add(new Password('password'))
        ;
    }
}
```

Si ya tienes un componente de validación puedes pasar los valores a `LoginForm` para mostrarlos
en una plantilla. Nota que para procesar el formulario no necesitamos saber cómo se validan
o filtran sus datos, ni como se mostrarán al usuario.

```php
$loginForm = new LoginForm();
$errors = $validator->validate($_POST); // whatever component you use
$loginForm->submit($_POST);
$loginForm->setErrorMessages($errors);
// Render the form however you want...
```

## Validación

Ya vimos que el formulario no necesita saber de un componente de validación, sin embargo el paquete
proporciona una interfaz `EasyForms\Validation\FormValidator` que puedes usar para integrar cualquier
componente de validación. El paquete ya cuenta con una integración con [zend-inputfilter][4].
Supongamos que ya tenemos el siguiente filtro:

```php
use Zend\Filter\StringTrim;
use Zend\InputFilter\Input;
use Zend\InputFilter\InputFilter;
use Zend\Validator\NotEmpty;
use Zend\Validator\StringLength;

class LoginFilter extends InputFilter
{
    public function __construct()
    {
        $this
            ->add($this->buildUsernameInput())
            ->add($this->buildPasswordInput())
        ;
    }

    protected function buildUsernameInput()
    {
        $username = new Input('username');
        $username
            ->getValidatorChain()
            ->attach(new NotEmpty())
            ->attach(new StringLength([
                'min' => 3,
            ]))
        ;
        $username
            ->getFilterChain()
            ->attach(new StringTrim())
        ;
        return $username;
    }

    protected function buildPasswordInput()
    {
        $password = new Input('password');
        $password
            ->getValidatorChain()
            ->attach(new NotEmpty())
            ->attach(new StringLength([
                'min' => 8,
            ]))
        ;
        return $password;
    }
}
```
Una primera opción es seguir usándolo sin integrarlo al formulario:

```php
$filter = new LoginFilter();
$filter->setData($_POST);
if (!$filter->isValid()) {
    $form->setErrorMessages($filter->getMessages());
}
$form->submit($filter->getValues());
// Render the form however you want...
```

La segunda opción es usar el validador que ya viene incluido en el paquete

```php
use EasyForms\Bridges\Zend\InputFilter\InputFilterValidator;

$validator = new InputFilterValidator(new LoginFilter());
$validator->validate($form = new LoginForm());
// Render the form however you want... Error messages will be set, if any
```

## Integración con Twig

Como ya explicamos, el formulario puede usar cualquier mecanismo de validación, lo mismo sucede
para la capa de presentación el formulario no necesita saber que apariencia tendrá.

La forma más simple de mostrar un formulario en una plantilla es simplemente llamando al método
`buildView` del formulario y pasar el resultado a cualquier motor de plantillas que usemos,
supongamos incluso que no usamos uno (aunque deberíamos):

```php
$view = $form->buildView()

// inside your template
echo "<label for=\"{$view->username->attributes['name']}\">Username</label>";
$htmlAttributes = '';
foreach ($view->username->attributes as $attribute => $value) {
    $htmlAttributes .= "{$attribute}=\"{$value}\" ";
}
echo '<input ' . trim($htmlAttributes) . '>';
```

El paquete cuenta con una integración con Twig, inspirada en la forma en la que se muestra los formularios
de Symfony2. La integración consiste de una extensión con 3 funciones principales `form_start`,
`form_end` y `element_row`. La explicación de las primeras dos funciones es un tanto obvia.
La funcion `element_row` muestra al elemento en tres secciones, una etiqueta, el elemento HTML
y los mensajes de error.

La extensión se registra de la siguiente forma:

```php
use EasyForms\Bridges\Twig\BlockOptions;
use EasyForms\Bridges\Twig\FormExtension;
use EasyForms\Bridges\Twig\FormRenderer;
use EasyForms\Bridges\Twig\FormTheme;

$environment = new Twig_Environment(new Twig_Loader([
  'vendor/comphppuebla/easy-forms/src/EasyForms/Bridges/Twig', // extension templates
  'path/to/your/templates',
]));
$theme = new FormTheme($environment, "layouts/bootstrap3.html.twig"); // form's theme
$renderer = new FormRenderer($theme, new BlockOptions());
$environment->addExtension(new FormExtension($renderer));
```

Como podemos observar en el código, la extensión utiliza temas para dar formato a los formularios.
Un tema es un grupo de plantillas que define o sobrescribe los bloques que muestran cada uno de los
elementos del formulario. El paquete cuenta con dos temas por defecto, uno es el tema `default`
que simplemente agrupa un elemento, su etiqueta y mensajes de error dentro de un `div`. El otro
tema da formato a un formulario con [Bootstrap 3][5].

Supongamos que pasamos desde el controlador nuestro formulario a una plantilla de Twig.

```php
$environment->render('login.html.twig', [
    'login' => $loginForm->buildView(),
]);
```

El código que usaríamos en nuestra plantilla de Twig para mostrar el formulario sería:

```twig
{% verbatim %}{{ form_start(login) }}
{{ element_row(login.username, {'label': 'Username', 'attr': {'id': 'username'}}) }}
{{ element_row(login.password, {'label': 'Password', 'attr': {'id': 'password'}}) }}
<button type="submit" class="btn btn-default">
    <span class="glyphicon glyphicon-home"></span> Login
</button>
{{ form_end() }}{% endverbatim %}
```

Como podemos observar, `element_row` recibe dos argumentos, el primero es el elemento del formulario
y el segundo es un arreglo asociativo, donde podemos definir la etiqueta del elemento `label`,
los atributos HTML de la etiqueta `label_attr`, los atributos HTML del elemento `attr` y `options`
que nos sirve para sobrescribir los valores de los bloques que se usan en la plantilla para mostrar
el elemento. Los bloques que podemos sobrescribir en `options` son `block` que sobrescribe el HTML
por default del elemento, y `rowBlock` que sobrescribe la forma en que se muestran la etiqueta, el
elemento y sus mensajes de error.

### Personalizar la apariencia de un elemento

Podemos agregar plantillas a nuestro tema o usar la misma plantilla que despliega nuestro formulario
para definir y sobrescribir bloques. Por ejemplo, supongamos que tenemos un formulario para agregar
productos a un catálogo en una aplicación de e-commerce y queremos dar formato de moneda al elemento
donde capturamos el precio unitario del elemento.

```twig
{% verbatim %}{# Use this template as part of the theme #}
{% form_theme [_self] %}
{# Custom block #}
{%- block money -%}
    <div class="input-group"><div class="input-group-addon">$</div>
        {%- set options = options|merge({'block': 'input'}) -%}
        {{- element(element, attr, options) -}}
    <div class="input-group-addon">.00</div></div>
{%- endblock money -%}
{{ form_start(product) }}
{{ element_row(product.name, {'label': 'Name'}) }}
{{ element_row(product.description, {'label': 'Description'}) }}
{# Override the element's default rendering block #}
{{ element_row(product.unitPrice, {'label': 'Unit price', 'options': {'block': 'money'}}) }}
<button type="submit" class="btn btn-default">
    <span class="glyphicon glyphicon-th-list"></span> Add to catalog
</button>
{{ form_end() }}{% endverbatim %}
```

En el ejemplo definimos un bloque personalizado llamado `money` y sobrescribimos el bloque por defecto
que usa nuestro elemento `unitPrice` para que lo utilice.

De este modo desacoplamos el procesamiento y validación del formulario de la forma en que se presenta
al usuario, si necesitamos por ejemplo usar [Foundation][6] en lugar de Bootstrap, solo necesitamos
crear un tema que herede del tema default y agregar las clases que usa Foundation. O si necesitamos
usar [Blade][7] en lugar de Twig podemos crear una extensión que use `sections` en lugar de `blocks`
que funcione como la extensión de Twig.

## Captchas y tokens CSRF

Hasta ahora hemos visto como procesar, validar y mostrar los datos de un formulario, dejando cada
responsabilidad a su respectivo componente. Hay funcionalidad en formularios que tal vez no necesitemos
siempre como pueden ser los [captchas][8] y los [tokens para prevenir CSRF][9].

### Captchas

Para manejar captchas el paquete cuenta con una integración con [zend-captcha][10] y actualmente podemos
usar captchas de imagen y [reCaptcha][11] (la versión anterior al No Captcha captcha). Supongamos que
tenemos un formulario para comentarios:

```php
use EasyForms\Elements\Captcha;
use EasyForms\Elements\Captcha\CaptchaAdapter;
use EasyForms\Elements\TextArea;
use EasyForms\Form;

class CommentForm extends Form
{
    public function __construct(CaptchaAdapter $adapter)
    {
        $this
            ->add(new TextArea('message'))
            ->add(new Captcha('captcha', $adapter))
        ;
    }
}
```

Al usar un adaptador, el formulario no necesita saber que tipo de captcha va a usar si de imagen o
ReCaptcha o algún otro. Si queremos usar reCaptcha lo único que debemos hacer es pasarle como
argumento el adaptador indicado, por ejemplo:

```php
use EasyForms\Bridges\Zend\Captcha\ReCaptchaAdapter;
use Zend\Captcha\ReCaptcha;
use Zend\Http\Client;
use ZendService\ReCaptcha\ReCaptcha as ReCaptchaService;

$reCaptcha = new ReCaptchaAdapter($captcha = new ReCaptcha([
    'service' => new ReCaptchaService(
        'your_public_key_xxx',
        'your_private_key_xxx',
        $params = null,
        $options = null,
        $ip = null,
        new Client($uri = null, ['adapter' => new Client\Adapter\Curl()])
    )
]));

$form = new CommentForm($reCaptcha);
```

Para mostrar el formulario en una plantilla Twig, necesitamos agregar la plantilla para captchas al
tema, como la funcionalidad de captchas es opcional, no está incluida en los temas por default.
Así, nuestra plantilla con el captcha quedaría como:

```twig
{% verbatim %}{% form_theme ['layouts/captcha-bootstrap3.html.twig'] %}
{{ form_start(comment) }}
{{ element_row(comment.message, {'label': 'Share your opinion'}) }}
{{ element_row(comment.captcha, {'label': 'Type the words in the image below'}) }}
<button type="submit" class="btn btn-default">
    <span class="glyphicon glyphicon-comment"></span> Comment
</button>
{{ form_end() }}{% endverbatim %}
```

Para validar el captcha podemos usar el siguiente filtro:

```php
use Zend\Captcha\ReCaptcha;
use Zend\Filter\StringTrim;
use Zend\Filter\StripTags;
use Zend\InputFilter\Input;
use Zend\InputFilter\InputFilter;
use Zend\Validator\NotEmpty;
use Zend\Validator\StringLength;

class CommentFilter extends InputFilter
{
    public function __construct(ReCaptcha $validator)
    {
        $this
            ->add($this->buildMessageInput())
            ->add($this->buildCaptchaInput($validator))
        ;
    }

    protected function buildMessageInput()
    {
        $message = new Input('message');
        $message
            ->getFilterChain()
            ->attach(new StringTrim())
            ->attach(new StripTags())
        ;
        $message
            ->getValidatorChain()
            ->attach(new NotEmpty())
            ->attach(new StringLength([
                'max' => 2000,
            ]))
        ;
        return $message;
    }

    public function buildCaptchaInput(ReCaptcha $validator)
    {
        $reCaptcha = new Input('captcha');
        $reCaptcha->setContinueIfEmpty(true);
        $reCaptcha
            ->getValidatorChain()
            ->attach($validator)
        ;
        return $reCaptcha;
    }
}
```

En nuestro controlador tendríamos algo como esto:

```php
$validator = new InputFilterValidator(new CommentFilter($captcha));
$validator->validate($form = new CommentForm($reCaptcha));
// Render the form...
```

### Tokens CSRF

Este paquete cuenta también con una integración con [symfony/security-csrf][12]. Podemos usar como
ejemplo nuestro formulario de login y agregarle un token CSRF, usando un objeto de la clase `Csrf`
Este elemento necesita dos argumentos, un identificador para el token y un proveedor de tokens.

```php
use EasyForms\Elements\Csrf\TokenProvider;
use EasyForms\Elements\Text;
use EasyForms\Elements\Password;
use EasyForms\Elements\Csrf;
use EasyForms\Form;

class LoginForm extends Form
{
    public function __construct(TokenProvider $csrfTokenProvider)
    {
        $this
            ->add(new Text('username'))
            ->add(new Password('password'))
            ->add(new Csrf('csrf_token', '_login_csrf_token', $csrfTokenProvider))
        ;
    }
}
```

El proveedor es una interfaz así que podemos usar un componente distinto al de Symfony2, si queremos,
sin afectar nuestro formulario. Podemos entonces crear un proveedor para nuestro formulario de la
siguiente forma:

```php
use EasyForms\Bridges\SymfonyCsrf\CsrfTokenProvider;
use Symfony\Component\Security\Csrf\CsrfTokenManager;
use Symfony\Component\Security\Csrf\TokenGenerator\UriSafeTokenGenerator;
use Symfony\Component\Security\Csrf\TokenStorage\NativeSessionTokenStorage;

$provider = new CsrfTokenProvider(
    new CsrfTokenManager(new UriSafeTokenGenerator(), new NativeSessionTokenStorage())
);
$form = new LoginForm($provider);
// Process the form...
// Pass it to template...
```

Para validar el token podemos agregar un validador a nuestro filtro anterior de la siguiente forma:

```php
use EasyForms\Bridges\Zend\InputFilter\Validator\CsrfValidator;
use EasyForms\Elements\Csrf\TokenProvider;
use Zend\InputFilter\Input;
use Zend\InputFilter\InputFilter;

class LoginFilter extends InputFilter
{
    public function __construct(TokenProvider $tokenProvider)
    {
        $this
            /* ... */
            ->add($this->buildCsrfInput($tokenProvider))
        ;
    }

    /* ... */

    protected function buildCsrfInput(TokenProvider $tokenProvider)
    {
        $csrf = new Input('csrf_token');
        $csrf->setContinueIfEmpty(true);
        $csrf
            ->getValidatorChain()
            ->attach(new CsrfValidator([
                'tokenProvider' => $tokenProvider,
                'tokenId' => '_login_csrf_token',
                'updateToken' => true,
            ]))
        ;
        return $csrf;
    }
}
```

Podemos entonces pasar nuestro proveedor al filtro y validar como de costumbre.

```php
use EasyForms\Bridges\Zend\InputFilter\InputFilterValidator;

$validator = new InputFilterValidator(new LoginFilter($provider));
$form = new LoginForm($provider);
$form->submit($_POST);
$validator->validate($form);
// Render the form...
```

Para mostrar este elemento solo debemos agregarlo a la plantilla, no hay necesidad de agregar
plantillas al tema, ya que este elemento es un `hidden` común en nuestro formulario.

```twig
{% verbatim %}{{ form_start(login) }}
{# ... #}
{{ element_row(login.csrf_token) }}
{# ... #}
{{ form_end() }}{% endverbatim %}
```

## Modificación dinámica de un formulario

Al trabajar con formularios es común que llenemos sus valores con información de nuestra base
de datos, o que agreguemos opciones a los `select` con los datos de una tabla, y que eso se
tenga que ver reflejado en los validadores de ese elemento. Creo que estas tareas no son
responsabilidad del formulario, en su lugar podemos generar objetos que configuren el
formulario. Regresemos al ejemplo de agregar productos al catálogo de una aplicación de 
e-commerce.

```php
use EasyForms\Elements\Text;
use EasyForms\Elements\TextArea;
use EasyForms\Form;

class ProductForm extends Form
{
    public function __construct()
    {
        $this
            ->add(new Text('name'))
            ->add(new Text('unitPrice'))
            ->add(new Select('category'))
        ;
    }
}
```

Queremos que al cargar el formulario las categorías de los productos se agreguen a las opciones
del `select`. Supongamos que nuestra clase `Catalog` es la responsable de manejar los datos de los
productos en la base de datos. El método `getCategoryOptions` consulta la base de datos a través de
`Catalog` y genera un array asociativo con los IDs y los nombres de las categorías.

```php
class ProductFormConfiguration
{
    protected $catalog;
    protected $categoryOptions;

    public function __construct(Catalog $catalog)
    {
        $this->catalog = $catalog;
    }

    public function getCategoryOptions()
    {
        $this->categoryOptions = [];
        array_map(function (CategoryInformation $category) use (&$options) {
            $this->categoryOptions[$category->categoryId] = $category->name;
        }, $this->catalog->allCategories());
        return $this->categoryOptions;
    }
}
```

Podemos entonces agregar un método al formulario que reciba como argumento nuestro objeto de
configuración y agregue las categorías al elemento correspondiente. Por ejemplo:

```php
class ProductForm extends Form
{
    /* .. */

    public function configure(ProductFormConfiguration $configuration)
    {
        /** @var Select $category */
        $category = $this->get('category');
        $category->setChoices($configuration->getCategoryOptions());
    }
}
```

En nuestro controlador tendríamos el siguiente código:

```php
$form = new ProductForm();
$form->configure(new ProductFormConfiguration(new Catalog());
// work with the form
```

Podemos actualizar el validador con una estrategía similar, supongamos que nuestro filtro
verifica que la categoría, es alguna de las que tenemos en nuestro catálogo y tenemos el
siguiente filtro:

```php
use Zend\InputFilter\Input;
use Zend\InputFilter\InputFilter;
use Zend\Validator\InArray;
use Zend\Validator\Int;
use Zend\Validator\NotEmpty;

class ProductFilter extends InputFilter
{
    public function __construct()
    {
        $this
            /* ... */
            ->add($this->buildCategoryInput())
        ;
    }

    /* ... */

    protected function buildCategoryInput()
    {
        $category = new Input('category');
        $category
            ->getValidatorChain()
            ->attach(new NotEmpty())
        ;
        $category
            ->getFilterChain()
            ->attach(new Int())
        ;
        return $category;
    }

    public function configure(ProductFormConfiguration $configuration)
    {
        $category = $this->get('category');
        $category
            ->getValidatorChain()
            ->attach(new InArray([
                'haystack' => $configuration->getValidCategories(),
            ]))
        ;
    }
}
```

El método `getValidCategories` funciona de forma similar, la diferencia es que el método
devuelve únicamente los IDs de las categorías, que es lo que el validador necesita.

```php
class ProductFormConfiguration
{
    /* ... */

    public function getValidCategories()
    {
        if (!$this->categoryOptions) {
            $this->categoryOptions();
        }

        return array_keys($this->categoryOptions);
    }
}
```

El filtro se configuraría de forma similar en nuestro controlador

```php
use EasyForms\Bridges\Zend\InputFilter\InputFilterValidator;

$configuration = new ProductFormConfiguration(new Catalog());
$form = new ProductForm();
$form->configure($configuration);
$filter = new ProductFilter();
$filter->configure($configuration);
$validator = new InputFilterValidator($filter);
$form->submit($_POST);
$validator->validate($form)
// do more work with the form...
```

El último caso que revisaremos es cuando editamos un registro de la base de datos usando
un formulario. Si seguimos con nuestro ejemplo, la forma más simple es agregar un método al
formulario que reciba un producto y asigne los valores de las propiedades del producto a los
elementos del formulario.

```php
class ProductForm extends Form
{
    /* ... */

    public function addProductId()
    {
        $this->add(new Hidden('productId'));
    }

    public function populateFrom(ProductInformation $product)
    {
        $this->populate([
            'productId' => $product->productId,
            'unitPrice' => $product->unitPrice,
            'name' => $product->name,
            'category' => $product->categoryId,
        ]);
    }
}
```

Donde el objeto `ProductInformation` es un [DTO][13] con los datos de un producto que recuperamos
de nuestro catálogo. Nuestro controlador sería algo similar al siguiente:

```php
$form->addProductId(); // Add the ID to be able to update the record
$form->populateFrom($product = $catalog->productOf($productId));
// Values of product are now in the form's elements values
```

Gracias por haber leido hasta aquí, si quieres ver más ejemplos revisa este [repositorio][14]. En el
siguiente post explicaré como la separación de responsabilidades *facilita* realizar tareas como
traducción y la integración de elementos que usan JavaScript (barras de progreso o vistas de árbol,
por ejemplo).

Agradecere mucho tus comentarios, dudas, quejas, sugerencias o reclamaciones.

[1]: http://symfony.com/doc/current/components/form/introduction.html
[2]: http://framework.zend.com/manual/current/en/modules/zend.form.intro.html
[3]: https://github.com/ComPHPPuebla/easy-forms
[4]: http://framework.zend.com/manual/current/en/modules/zend.input-filter.intro.html
[5]: http://getbootstrap.com/
[6]: http://foundation.zurb.com/
[7]: http://laravel.com/docs/5.0/templates
[8]: http://es.wikipedia.org/wiki/Captcha
[9]: https://www.owasp.org/index.php/Cross-Site_Request_Forgery_%28CSRF%29_Prevention_Cheat_Sheet#Encrypted_Token_Pattern
[10]: http://framework.zend.com/manual/current/en/modules/zend.captcha.operation.html
[11]: https://www.google.com/recaptcha/intro/index.html
[12]: https://github.com/symfony/security-csrf
[13]: http://en.wikipedia.org/wiki/Data_transfer_object
[14]: https://github.com/MontealegreLuis/easy-forms-examples
