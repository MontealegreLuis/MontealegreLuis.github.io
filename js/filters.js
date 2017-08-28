/**
 * This source file is subject to the license that is bundled with this package in the file LICENSE.
 */
(function () {
    "use strict";
    var $button = $("button");
    var $grid = $(".grid").isotope({
        itemSelector: ".grid-item",
        layoutMode: "fitRows"
    });
    $button.on('click', function () {
        $button.removeClass("active");
        var cssClass = $(this).data("filter");
        var filter = cssClass !== "*" ? "." + cssClass : cssClass;
        $grid.isotope({ filter: filter });
        $(this).addClass("active");
    });
})();
