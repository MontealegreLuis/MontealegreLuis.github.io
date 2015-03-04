# Blog personal

Primero debes descargar el archivo `.phar` de [Sculpin][1]

```bash
$ curl -O https://download.sculpin.io/sculpin.phar
```

Después lo más simple es mover el archivo a la carpeta `/bin` del proyecto y darle permisos de ejecución:

```bash
$ mv sculpin.phar bin/sculpin
$ chmod u+x bin/sculpin
```

Una vez que tienes el ejecutable listo, lo que sigue es instalar el blog

```bash
$ php bin/sculpin install
```

Una vez instalado el blog puedes verlo en [http://localhost:8000/][2] usando el siguiente comando:

```bash
$ php bin/sculpin generate --watch --server
```

Puedes visitar el blog [aquí][3].

[1]: https://sculpin.io
[2]: http://localhost:8000/
[3]: http://www.montealegreluis.com
