Visualization functions for WebPPL (browser only, for now)

Demo: http://probmods.github.io/webppl-viz/

Dependencies:

- webppl version 0.6.2 or higher
- webppl-editor commit 321b575 or later

Usage: include webppl-viz.js and webppl-viz.css in your web page.

## Standard functions

### Table

Shows an ERP as a textual table.

Function signatures:

- `viz.table(erp, [options])`
- `viz.table(samples, [options])`

Options:

- `log` (default = false). If true, shows log probabilities.

### Bar chart

Function signatures:

- `viz.bar(df, [options])`
- `viz.bar(xs, ys, [options])`

Options:

- `horizontal` (default: false). Draw a horizontal bar chart rather than vertical one. (TODO)
- `xLabel` (default: x). x axis label.
- `yLabel` (default: y). y axis label.
- `xType` (default: y). y axis label.

### Histogram

Function signatures:

- `viz.hist(samples, [options])`
- `viz.hist(erp, [options])`

Options:

- `numBins` (defaults to 30). For real-valued data, how many bins to aggregate data into.

### Line chart

Function signatures:

- `viz.line(df, [options])`
- `viz.line(xs, ys, [options])`

Options:

- `xLabel` (default: x). x axis label.
- `yLabel` (default: y). y axis label.
- `groupBy` (default: none). Grouping variable for different lines.

### Scatter plot

Function signatures:

- `viz.scatter(xs, ys, [options])`

Options:

- `xLabel` (default: x). x axis label.
- `yLabel` (default: y). y axis label.

### Density curve

Function signatures:

- `viz.density(samples, [options])`
- `viz.density(erp, [options])` (TODO: save total_count in webppl Histogram.toERP)

Options:

- `bounds` (default: min and max of the supplied samples). An array of bounds for density estimation

### Heat map

- `viz.heatMap(samples, [options])`
- `viz.heatMap(erp, [options])` (TODO: save total_count in webppl Histogram.toERP)

### Parallel coordinates

TODO: expose this functionality to end users

- `viz.parcoords(erp)`

## Automatic function

There is currently only one automatic function: `viz.auto(erp, [options])`

`viz.auto` tries to automatically construct a suitable visualization based on the types of the items in the ERP support.

Options:

- `summarize` (default = false). (TODO) For data with real-valued components, you can either try to show all the data (scatter plot) or summarize by showing a density estimate (heat map). This option has no effect if data is entirely categorical.

### Data types

First, a bit of notation: `c` stands for categorical variables and `r` for real variables (for now, ordinal variables are treated as categorical).

Some examples of types for different supports:

- Every support element is a string → type is `c`
- Every support element is an integer → type is `c`
- Every support element is a real number → type is `r`
- Every support element is an object `{k1: <a>, k2: <b>}` → `<a><b>`
	- (e.g., if `<a>` is `r` and `<b>` is `c`, then the type is `rc`)
- Every support element is an array `[<a>,<b>]` → type is `<a><b>`
	- (e.g., if `<a>` is `r` and `<b>` is `c`, then the type is `rc`)

### Type renderings

- `c`: histogram
- `r`: density curve
- `cc`: frequency table
- `cr`: density curve, colors for different categorical groups
- `rr`: scatter plot (TODO: add heatmap)
- `ccc`: trellis frequency table
- `ccr`: trellis density plot, colors for different categorical groups
- `crr`: trellis scatter plot (TODO: add trellis heatmap)
- `rrr+` (3 or more `r`'s): parallel coordinates plot
- `cccc`: trellis frequency table (TODO)
- `cccr`: trellis scatter plot (TODO: add trellis heat map)
- `ccrr`: trellis scatter plot / heat map (TODO)
- `crrr`: trellis parallel coordinates plot (TODO)
- `ccrrr`: trellis parallel coordinates plot (TODO)

## Developing

```sh
grunt setup-demo       # make webppl and webppl-editor dependencies for demo
grunt bundle           # compile js + minify, make css
grunt browserify       # compiling js
grunt uglify           # minify js
grunt browserify-watch # watchified compile js
grunt css              # make css
```
