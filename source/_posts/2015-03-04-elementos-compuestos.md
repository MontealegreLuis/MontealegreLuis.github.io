---
title: Elementos compuestos en formularios
tags:
    - PHP
    - Forms
categories:
    - PHP
use:
    - posts_categories
---
En nuestro [post anterior sobre formularios][1] revisamos como usar el paquete
[comphppuebla/easyforms][2] En este post desarrollaremos un ejemplo para ilustrar
como podemos combinar un elemento del tipo `text` y uno de tipo `select` para
crear un nuevo elemento de tipo **moneda**. Para esto realizaremos 3 tareas:

* Creación de un elemento moneda
* Creación de un filtro para validar elementos del tipo moneda
* Plantilla para mostrar nuestro elemento moneda

## Creación de elemento moneda

> "If I had a dime for every time I've seen someone use FLOAT to store currency, I'd have $999.997634" -- [Bill Karwin][3]

Supongamos que tenemos nuevamente nuestra aplicación de catálogo de productos y que
estamos usando el [patrón de diseño de moneda][4] para los precios de los productos
en lugar de usar valores de tipo `float`, porque ahora tenemos productos que podemos
comprar y vender en dólares y en pesos.

Nuestro objetivo es crear un formulario que nos permita editar la información
de los precios de compra y venta de nuestros productos como se muestra en la
siguiente imagen:

<img src="/images/content/form-money.png" class="img-responsive img-rounded center-block" alt="Formulario con elementos de moneda">

Nuestro primer paso es crear un elemento que extienda de `EasyForms\Elements\Element`
compuesto a su vez por otros dos elementos `amount` y `currency` del tipo
`EasyForms\Elements\Text` y `EasyForms\Elements\Select` respectivamente.

```php
use EasyForms\Elements\Element;
use EasyForms\Elements\Select;
use EasyForms\Elements\Text;

class Money extends Element
{
    protected $amount;
    protected $currency;

    public function __construct($name)
    {
        parent::__construct($name);
        $this->amount = new Text("{$name}[amount]");
        $this->currency = new Select("{$name}[currency]");
    }
}
```

Los valores de nuestro elemento serán recuperados en forma de un arreglo con las
llaves `amount` y `currency`.

Al ser un elemento compuesto, debemos modificar la forma en que se manipula su
valor, por lo que tenemos que sobrecargar los métodos `setValue` y
`value`.

* `setValue` debe tomar el arreglo que viene de alguna de las superglobales
`$_GET` o `$_POST` y pasar el valor correspondiente llamando al método `setValue`
de los elementos `amount` y `currency` respectivamente.
* `value`, por el contrario, debe recuperar el valor de los elementos `amount` y
`currency` llamando al método `value` en cada objeto, a fin de devolver el arreglo
original que recibió de alguna de las variables superglobales.

```php
// ...
class Money extends Element
{
    // ...

    public function setValue($value)
    {
        $this->amount->setValue($value['amount']);
        $this->currency->setValue($value['currency']);
    }

    public function value()
    {
        return [
            'amount' => $this->amount->value(),
            'currency' => $this->currency->value(),
        ];
    }
}
```

Es necesario pasar al elemento `select` los tipos de moneda válidos que el
usuario puede elegir. Supongamos que estos valores los recuperamos del catálogo de
productos.

```php
// ...

class Catalog
{
    // ...

    public function validCurrencies()
    {
        return ['MXN', 'USD'];
    }
}
```

## Filtro para validar un elemento moneda

Vamos a escribir ahora un filtro para validar cualquier elemento de tipo moneda.
Creamos entonces una clase `MoneyFilter` que herede de `Zend\InputFilter\InputFilter`.

Para el elemento `amount` validaremos que se trate de un número entero.

```php
use Zend\InputFilter\Input;
use Zend\InputFilter\InputFilter;
use Zend\Validator\Digits;
use Zend\Validator\NotEmpty;
// ...

class MoneyFilter extends InputFilter
{
    // ...
    protected function buildAmountInput()
    {
        $amount = new Input('amount');

        $amount
            ->getValidatorChain()
            ->attach(new NotEmpty(['type' => NotEmpty::INTEGER]))
            ->attach(new Digits())
        ;

        return $amount;
    }
}
```

Para el elemento `currency` debemos agregar un validador `InArray` que verifique
que el valor proporcionado es uno de los valores permitidos por el catálogo de
productos.

```php
use Zend\Validator\InArray;
// ...
class MoneyFilter extends InputFilter
{
    // ...
    public function buildCurrencyInput(array $validCurrencies)
    {
        $currency = new Input('currency');
        $currency->setContinueIfEmpty(true);

        $currency
            ->getValidatorChain()
            ->attach(new InArray([
                'haystack' => $validCurrencies,
            ]))
        ;

        $this->add($currency);
    }
}
```

El objetivo del patrón de moneda es no guardar valores flotantes para evitar
problemas de redondeo, es por eso que para validar `amount` hemos agregado un
validador del tipo `Digits`.

Para que la validación funcione debemos multiplicar
el valor introducido por el usuario por 100, si el resultado es un valor entero
(contiene solo dígitos), significa que es un valor de moneda válido, ya que contiene
solo dos dígitos después del punto decimal, además de que ese valor entero es el
que debemos guardar en la base de datos.

```php
// ...
class MoneyFilter extends InputFilter
{
    // ...
    public function setData($data)
    {
        $data['original_amount'] = $data['amount'];
        $data['amount'] = $data['amount'] * 100;

        parent::setData($data);
    }
}
```

En el *snippet* anterior guardamos el valor original porque debemos mostrarlo
en el formulario en el caso de que la validación falle.

Además de guardar el valor original, debemos modificar los métodos `getValues`
y `getMessages`.

* `getValues` debe recuperar el valor original proporcionado por el usuario,
el cual se almacena en `$this->data['original_amount']`
* `getMessages` debe agrupar los mensajes de los dos elementos que se están
validando, ya que para el usuario final se trata de un único elemento y sus
mensajes de error deben mostrarse juntos.

```php
// ...
class MoneyFilter extends InputFilter
{
    // ...
    public function getValues()
    {
        $values = parent::getValues();
        $values['amount'] = $this->data['original_amount'];

        return $values;
    }

    public function getMessages()
    {
        $messages = parent::getMessages();

        $moneyMessages = [];
        if (isset($messages['amount'])) {
            $moneyMessages = $messages['amount'];
            unset($messages['amount']);
        }
        if (isset($messages['currency'])) {
            $moneyMessages = array_merge($moneyMessages, $messages['currency']);
            unset($messages['currency']);
        }

        $messages[$this->name] = $moneyMessages;

        return $messages;
    }
}
```

### Filtro para el formulario

Ya que tenemos el nuevo elemento y el filtro que valida elementos de ese tipo
podemos crear nuestro formulario y filtro para cambiar los precios de un producto.

Empecemos con el formulario:

```php
use EasyForms\Form;

class ProductPricingForm extends Form
{
    public function __construct()
    {
        $this
            ->add(new Money('cost_price'))
            ->add(new Money('sale_price'))
        ;
    }
}
```

El filtro sería el siguiente:

```php
use Zend\InputFilter\InputFilter;

class ProductPricingFilter extends InputFilter
{
    public function __construct()
    {
        $this
            ->add(new MoneyFilter('cost_price'), 'cost_price')
            ->add(new MoneyFilter('sale_price'), 'sale_price')
        ;
    }
}
```

Tanto al filtro como al formulario necesitamos pasarles los valores válidos
para `currency`. Usaremos un objeto de configuración como en nuestro ejemplo
del post anterior.

```php
class ProductPricingConfiguration
{
    protected $catalog;

    public function __construct(Catalog $catalog)
    {
        $this->catalog = $catalog;
    }

    public function getCurrencyChoices()
    {
        return array_combine(
            $this->catalog->validCurrencies(),
            $this->catalog->validCurrencies()
        );
    }

    public function getCurrenciesHaystack()
    {
        return $this->catalog->validCurrencies();
    }
}
```

Agregamos un método `configure` tanto al filtro como al formulario.

```php
class ProductPricingFilter extends InputFilter
{
    // ...
    public function configure(ProductPricingConfiguration $configuration)
    {
        $this
            ->get('cost_price')
            ->buildCurrencyInput($configuration->getCurrenciesHaystack())
        ;
        $this
            ->get('sale_price')
            ->buildCurrencyInput($configuration->getCurrenciesHaystack())
        ;
    }
}

class ProductPricingForm extends Form
{
    // ...
    public function configure(ProductPricingConfiguration $configuration)
    {
        $this
            ->get('cost_price')
            ->setCurrencyChoices($configuration->getCurrencyChoices())
        ;
        $this
            ->get('sale_price')
            ->setCurrencyChoices($configuration->getCurrencyChoices())
        ;
    }
}
```

## El controlador

En nuestro controlador tenemos que hacer dos cosas:

1. Si la solicitud fue hecha a través del método `GET` recuperamos la información
del producto desde nuestra base de datos y llenamos el formulario con esos datos.
2. Si la solicitud llega a través de `POST` debemos validar la información que nos
mandó el usuario si la validación pasa, guardamos los cambios, en caso contrario
mostramos los errores en el formulario.

Supongamos que tenemos una entidad producto como la siguiente:

```php
use Money\Money;

class Product
{
    protected $productId;
    protected $name;
    protected $description;
    protected $costPrice;
    protected $salePrice;

    public function __construct(
        $productId,
        $name,
        Money $costPrice,
        Money$salePrice,
        $description = null
    )
    {
        $this->productId = $productId;
        $this->costPrice = $costPrice;
        $this->salePrice = $salePrice;
        $this->name = $name;
        $this->description = $description;
    }

    public function changePrices(Money $costPrice, Money $salePrice)
    {
        $this->costPrice = $costPrice;
        $this->salePrice = $salePrice;
    }

    public function information()
    {
        $information = new ProductInformation();
        $information->productId = $this->productId;
        $information->name = $this->name;
        $information->description = $this->description;
        $information->costPrice = $this->costPrice;
        $information->salePrice = $this->salePrice;

        return $information;
    }
}
```

Nuestro controlador sería algo similar al siguiente, el método `editProductPrices`
corresponde a una solicitud `GET` mientras que `updateProductPrices` corresponde
a `POST`:

```php
class ChangeProductPrices
{
    protected $view
    protected $form;
    protected $validator;
    protected $catalog;

    public function __construct(
        Twig_Environment $view,
        ProductPricingForm $form,
        InputFilterValidator $validator,
        Catalog $catalog
    )
    {
        $this->view = $view;
        $this->form = $form;
        $this->validator = $validator;
        $this->catalog = $catalog;
    }

    public function editProductPrices($productId)
    {
        $product = $this->catalog->productOf($productId);
        $this->form->populateFrom($product->information());

        return $this->view->render('product/edit-product.html.twig', [
            'form' => $this->form->buildView(),
        ]);
    }

    public function updateProductPrices(Request $request)
    {
        $this->form->submit($request->post());

        if ($this->validator->validate($this->form)) {
            $pricing = $this->form->values()
            $costPrice = new Money(
                (int) round($pricing['cost_price']['amount'] * 100),
                new Currency($pricing['cost_price']['currency'])
            );
            $salePrice = new Money(
                (int) round($pricing['sale_price']['amount'] * 100),
                new Currency($pricing['sale_price']['currency'])
            );

            $product = $this->catalog->productOf($pricing['productId']);
            $product->changePrices($costPrice, $salePrice);

            $this->catalog->update($product);
            $this->redirect('products_list');
        }

        return $this->view->render('product/edit-product.html.twig', [
            'form' => $request->form(),
        ]);
    }
}
```

# Plantilla para el formulario

Lo último que nos falta por resolver es como mostraremos nuestro elemento
moneda con Twig. El objetivo es que para la plantilla sea lo más transparente posible.

```twig
{% verbatim %}{{ form_start(form) }}

{{ element_row(form.cost_price, {'label': 'Cost price', 'attr': {'id': 'cost_price'}}) }}
{{ element_row(form.sale_price, {'label': 'Sale price', 'attr': {'id': 'sale_price'}}) }}

{{ form_rest(form) }}

<button type="submit" class="btn btn-default">
    <span class="glyphicon glyphicon-usd"></span> Update pricing
</button>

{{ form_end() }}{% endverbatim %}
```

Para lograrlo debemos sobrecargar el método `buildView` de nuestro elemento `Money`.
Necesitamos también un `MoneyView` que extienda de `ElementView` que a su vez contenga
los objetos `View` tanto del elemento `text` como del elemento `select`.

```php
use EasyForms\View\ElementView;

class MoneyView extends ElementView
{
    /** @var ElementView */
    public $amount;

    /** @var SelectView */
    public $currency;
}

class Money extends Element
{
    // ...
    public function buildView(ElementView $view = null)
    {
        $view = new MoneyView();

        $view = parent::buildView($view);

        $view->amount = $this->amount->buildView();
        $view->currency = $this->currency->buildView();
        $view->block = 'money';

        return $view;
    }
}
```

Aprovecharemos que podemos definir bloques directamente en la plantilla
del formulario para definir un bloque especial para los elementos del
tipo `Money`.

```twig
{% verbatim %}{% extends 'layouts/base.html.twig' %}

{% block title %}/ Update product prices{% endblock %}

{# Use this template to add an inline block #}
{% form_theme [_self] %}

{# Money block #}
{%- block money -%}
    <div class="form-inline">
        <div class="form-group">
            <div class="input-group">
                <div class="input-group-addon">$</div>
                {# Render the money amount as a text element #}
                {%- set options = options|merge({'block': 'input'}) -%}
                {%- set attr = attr|merge(element.amount.attributes) -%}
                {{- element(element.amount, attr, options) -}}
            </div>
            {# Render the money currency as a select element #}
            {%- set options = options|merge({'block': 'select'}) -%}
            {%- set attr = attr|merge(element.currency.attributes) -%}
            {{- element(element.currency, attr, options) -}}
        </div>
    </div>
{%- endblock money -%}

{% block content %}
    <div class="row">
        <div class="col-md-12">
            <div class="panel panel-default">
                <div class="panel-heading">Update product pricing</div>
                <div class="panel-body">
                    {# The form goes here... #}
                </div>
            </div>
        </div>
    </div>
{% endblock %}{% endverbatim %}
```

## Fin

Puedes revisar un ejemplo similar en este [repositorio][5], en el código relacionado
con la ruta `/composite-element`, espero que te sea útil. Agradeceré mucho tus
comentarios, dudas, quejas, sugerencias o reclamaciones.

[1]: http://www.montealegreluis.com/blog/2015/02/05/un-formulario-no-tiene-porque-hacer-todo/
[2]: http://comphppuebla.github.io/easy-forms/
[3]: https://twitter.com/billkarwin/status/347561901460447232
[4]: http://martinfowler.com/eaaCatalog/money.html
[5]:https://github.com/MontealegreLuis/easy-forms-examples
