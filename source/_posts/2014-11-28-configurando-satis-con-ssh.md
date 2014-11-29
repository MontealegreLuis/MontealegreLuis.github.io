---
title: Configurando Satis con SSH
tags:
    - Composer
categories:
    - PHP
use:
    - posts_categories
---
[Composer][1] es una herramienta para el manejo de dependencias en PHP que nos permite declarar los paquetes que
utilizan nuestros proyectos y los instala en la carpeta `vendor`. Composer basa su funcionamiento en dos conceptos
importantes **paquetes** y **repositorios**.

1. Un paquete es escencialmente un directorio que contiene código PHP, aunque en teoría podría contener cualquier tipo
de archivos. Un paquete se identifica a través de su nombre y su versión, además contiene otros metadatos necesarios
para su instalación.
2. Un [repositorio][4] es el lugar donde se encuentra el código de los paquetes PHP. [Packagist][5] es el
repositorio por default que utiliza Composer, aunque es posible usar más repositorios.

Existen varios tipos de repositorios:

* **composer**: un repositorio del tipo composer es un archivo `packages.json` servido a través de HTTP, FTP, o SSH, que
contiene una lista con la información de los paquetes de ese repositorio.
* **vcs**: El repositorio del tipo vcs puede recuperar paquetes de repositorios `git`, `svn` y `hg`.
* **pear**: Sirve para instalar cualquier repositorio de [PEAR][9].
* **package**: Este tipo de repositorio sirve para código que no soporta Composer. Basicamente incluimos la definición
del paquete (nombre y versión) y una URL de descarga (generalmente a un archivo `zip` o un `tar`.

Si quieres aprender como funciona Composer revisa esta [presentación de Rafael Dohms][2]. Ahora, si tu interés es
aprender a construir paquetes para PHP te recomiendo mucho este [libro de Matthias Noback][3].

## ¿Qué es Satis?

Satis es un generador estático de repositorios del tipo `composer`, es de [código abierto][6] y básicamente te permite tener
una versión privada minimalista de Packagist. Es este post explicaré como instalar y configurar un repositorio de Satis
con acceso SSH.

## Instalación

Primero tienes que instalar Composer en el servidor donde quieres alojar tu repositorio de Satis. Supongamos que yo lo
quiero alojar en `http://packages.montealegreluis.com`. Primero debo instalar Composer de forma global.

~~~bash
# replace 'satis_user' with your user
$ curl -s https://getcomposer.org/installer | php -- --install-dir=/home/satis_user/bin
$ mv ~/bin/composer.phar ~/bin/composer
$ chmod u+x ~/bin/composer
~~~

Lo siguiente es instalar Satis

~~~bash
$ composer create-project composer/satis --stability=dev --keep-vcs
~~~

Esto creará una carpeta `satis` con el binario que nos permitirá crear nuestro repositorio. El primer paso es
definir un archivo de configuración (`satis.json`) con la lista de paquetes privados que quieres usar.
Supongamos que tengo un repositorio privado en Github (`https://github.com/ComPHPPuebla/dbal-fixtures`) con el paquete
`comphppuebla/dbal-fixtures` que quiero usar en mi proyecto  con una versión estable entre `1.0.0` y  `2.0.0`.

~~~json
{
    "name": "My Repository",
    "homepage": "http://packages.montealegreluis.com",
    "repositories": [
        { "type": "vcs", "url": "https://github.com/ComPHPPuebla/dbal-fixtures" }
    ],
    "require-all": true
}
~~~

La llave `require-all` indica que queremos todas las versiones de todos los paquetes. [Aquí][7] hay ejemplos si
quieres hacer una selección más específica. Muy probablemente quieras poner el archivo `satis.json` en su propio
repositorio en Git.

Para construir el repositorio a partir del archivo de configuración ejecutamos el siguiente comando:

~~~bash
$ php bin/satis build satis.json storage/
~~~

`storage` es la carpeta donde se guardarán los archivos de nuestro repositorio.

## Uso de Satis

Siguiendo con el ejemplo, una vez que tengo instalado el repositorio Satis, tengo que agregar al archivo `composer.json`
de mi proyecto la URL del repositorio Satis que acabo de generar.

~~~json
{
  "require": {
    "php": ">=5.5",
    "comphppuebla/dbal-fixtures": "~1.0",
  },
  "repositories": [
    {
      "type": "composer",
      "url": "ssh2.sftp://packages.mandragora-web-systems.com/home/satis_user/satis/storage"
    }
  ]
}
~~~

La URL `ssh2.sftp://packages.mandragora-web-systems.com/home/satis_user/satis/storage` indica que accederemos a
Satis a través de SSH y que el archivo `packages.json` que necesita Composer para saber cuáles son los paquetes que
aloja nuestro repositorio, está ubicado en la carpeta `/home/satis_user/satis/storage`. Para que puedas tener acceso a
traves de SSH debes tener instalada la [extension PECL SSH2][8].

Si no tienes instalada la extensión estos son los comandos para instalarla en Ubuntu.

~~~bash
$ apt-get install -y libssh2-1 libssh2-1-dev
$ apt-get install -y php-pear
$ pecl -d preferred_state=beta install ssh2
$ echo "extension=ssh2.so" >> /etc/php5/apache2/php.ini
~~~

Como el acceso es a través de SSH debemos indicar la ubicación de las llaves y el nombre de usuario que usaremos para
autenticarnos a través del valor de `options`.

~~~json
{
    "repositories": {
        "montealegreluis": {
            "type": "composer",
            "url": "ssh2.sftp://packages.mandragora-web-systems.com:/home/satis_user/satis/storage",
            "options": {
                "ssh2": {
                    "username": "satis_user",
                    "pubkey_file": "/home/luis/.ssh/id_rsa.pub",
                    "privkey_file": "/home/luis/.ssh/id_rsa"
                }
            }
        }
    }
}
~~~

## Configurando Satis de forma global

Podemos configurar nuestro repositorio en el archivo `composer.json` para cada proyecto. Sin embargo no resulta tan
práctico ya que, estamos poniendo rutas absolutas para la opción `pubkey_file` y `privkey_file`, cuyo valor es
`/home/luis/.ssh/id_rsa.pub` y `/home/luis/.ssh/id_rsa` respectivamente. Si quiero instalar el proyecto en otra
computadora y no tiene el usuario `luis` tendré que modificar las rutas hacias las llaves.

Composer cuenta con un archivo de configuración global `config.json` al que podemos agregar repositorios como el que
acabamos de crear de forma global. Si continuamos con el ejemplo en mi caso el archivo estaría en
`/home/luis/.composer/config.json`.

Si quieres saber cuáles son tus configuraciones globales actuales puedes ejecutar el comando:

~~~bash
$ composer config -g -l
~~~

Así lo único que tienes que hacer es copiar y pegar las configuraciones de tu repositorio desde el archivo `composer.json`
de tu proyecto al archivo `config.json`

Para que funcione el ejemplo debes agregar tus llaves al servidor donde se encuentra el repositorio Satis. Si aún no
tienes tus llaves SSH las puedes crear así:

~~~bash
$ ssh-keygen -t rsa -C "your_email@example.com"
~~~

Y las puedes copiar a tu servidor Satis así:

~~~bash
$ ssh-copy-id -i ~/.ssh/id_rsa.pub satis_user@packages.montealegreluis.com
~~~

Una vez que tienes todo configurado sólo es cuestión de ejecutar el `install`  de Composer y tu paquete se instalará
desde tu repositorio Satis.

~~~bash
$ composer install
~~~

Espero que el post te sirva para configurar tu propio repositorio Satis. Si tienes algun comentario o alguna experiencia
que quieras compartir te lo agradeceré mucho.

[1]: https://getcomposer.org/
[2]: http://www.slideshare.net/rdohms/composer-for-busy-developers-phptek13
[3]: https://leanpub.com/principles-of-php-package-design
[4]: https://getcomposer.org/doc/05-repositories.md
[5]: http://packagist.org/
[6]: https://github.com/composer/satis
[7]: https://getcomposer.org/doc/articles/handling-private-packages-with-satis.md#setup
[8]: http://pecl.php.net/package/ssh2
[9]: http://pear.php.net/
