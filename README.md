WebPPL visualization library

Demo: http://probmods.github.io/webppl-viz/

Dependencies:

- webppl (0.7.0-a57eea7 or later)
- webppl-editor (eeb3208 or later)

Usage:

- Browser: include webppl-viz.js and webppl-viz.css in your web page.
- Command-line: require as a [WebPPL package](http://docs.webppl.org/en/master/packages.html#webppl-packages)

### Basic functions

#### Table

Shows an ERP as a textual table.

Function signatures:

- `viz.table(erp, [options])`
- `viz.table(samples, [options])`

Options:

- `log` (default = false). If true, shows log probabilities.
- `top` (default = false). If a number n, only shows top n results.

#### Bar chart

Function signatures:

- `viz.bar(df, [options])`
- `viz.bar(xs, ys, [options])`

Options:

- `horizontal` (default: false). Draw a horizontal bar chart rather than vertical one. (TODO)
- `xLabel` (default: x). x axis label.
- `yLabel` (default: y). y axis label.
- `xType` (default: nominal). type of x axis (nominal or quantitative).
- `groupBy` (default: none). Grouping variable for different bars.

#### Histogram

Function signatures:

- `viz.hist(samples, [options])`
- `viz.hist(erp, [options])`

Options:

- `numBins` (defaults to 30). For real-valued data, how many bins to aggregate data into.

#### Line chart

Function signatures:

- `viz.line(df, [options])`
- `viz.line(xs, ys, [options])`

Options:

- `xLabel` (default: x). x axis label.
- `yLabel` (default: y). y axis label.
- `groupBy` (default: none). Grouping variable for different lines.

#### Scatter plot

Function signatures:

- `viz.scatter(xs, ys, [options])`
- `viz.scatter(df, [options])`

Options:

- `xLabel` (default: x). x axis label.
- `yLabel` (default: y). y axis label.

#### Density curve

Function signatures:

- `viz.density(samples, [options])`
- `viz.density(erp, [options])` (TODO: save total_count in webppl Histogram.toERP)

Options:

- `bounds` (default: min and max of the supplied samples). An array of bounds for density estimation

#### Heat map

- `viz.heatMap(samples, [options])`
- `viz.heatMap(erp, [options])` (TODO: save total_count in webppl Histogram.toERP)

#### Parallel coordinates

TODO: expose this functionality to end users

- `viz.parcoords(erp)`

### Complex functions

#### Marginals

`viz.marginals` shows each component of a joint distribution -- density plots for real components and histograms for categorical components.

#### Automatic visualization

`viz.auto` tries to automatically construct a useful visualization based on the types of the different components in the posterior.

Options:

- `summarize` (default = false). (TODO) For data with real-valued components, you can either try to show all the data (scatter plot) or summarize by showing a density estimate (heat map). This option has no effect if data is entirely categorical.

##### Data types

First, a bit of notation: `c` stands for categorical variables and `r` for real variables (for now, ordinal variables are treated as categorical).

Some examples of types:

| Support element | Type                         | Notes                                              |
| --------------- | ---------------------------- | -------------------------------------------------- |
| String          | `c`                          |                                                    |
| Integer         | `c`                          |                                                    |
| Real number     | `r`                          |                                                    |
| Object          | combined types of all values | The type of `{fruit: 'apple', price: 3.6}` is `rc` |
| Array           | combined types of all values | The type of `[9.2, 8.1, 'candy bar']` is `rrc`     |


##### How each type is visualized

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

### Development notes

```sh
grunt setup-demo       # make webppl and webppl-editor dependencies for demo
grunt bundle           # compile js + minify, make css
grunt browserify       # compiling js
grunt uglify           # minify js
grunt browserify-watch # watchified compile js
grunt css              # make css
```
