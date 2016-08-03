**Notice: The architecture of this library is still evolving, so expect (many) backwards-incompatible changes**

WebPPL visualization library. Demo: [probmods.github.io/webppl-viz/](http://probmods.github.io/webppl-viz/).

Dependencies: 

- webppl (0.8.1 or later)
- *(optional)* webppl-editor (eeb3208 or later)
- Cairo (see [instructions for your operating system](https://github.com/Automattic/node-canvas/#installation))

Installation:

```sh
cd ~                             # or however you get to the home directory
mkdir .webppl                    # make a folder called .webppl (if it doesn't already exist)
npm install probmods/webppl-viz  # install this node package
```

Usage:

- Command-line: require as a [WebPPL package](http://docs.webppl.org/en/master/packages.html#webppl-packages). Example: `webppl foo.wppl --require webppl-viz`
- Browser: build (run `grunt bundle`) and then include webppl-viz.js and webppl-viz.css on your web page.

## Plotting data

Methods for plotting raw data.

#### Bar plot

`viz.bar(df, [options])`

`viz.bar(xs, ys, [options])`

*Options*:

- `horizontal` (default: false). (TODO) draw a horizontal plot rather than vertical one.
- `xLabel` (default: x). x axis label.
- `yLabel` (default: y). y axis label.
- `xType` (default: nominal). type of x axis (nominal or quantitative).
- `groupBy` (default: none). Grouping variable for different bars.

#### Line plot

`viz.line(df, [options])`

`viz.line(xs, ys, [options])`

*Options*:

- `xLabel` (default: x). x axis label.
- `yLabel` (default: y). y axis label.
- `groupBy` (default: none). Grouping variable for different lines.

#### Scatter plot

`viz.scatter(xs, ys, [options])`

`viz.scatter(df, [options])`

*Options*:

- `xLabel` (default: x). x axis label.
- `yLabel` (default: y). y axis label.

## Plotting distributions (basic)

Basic methods for visualizing samples and marginal distributions. These plot data that are up to 2-dimensional.

#### Table

`viz.table(dist, [options])`

`viz.table(samples, [options])`

*Options*:

- `log` (default = false). If true, shows log probabilities.
- `top` (default = false). If a number `n`, only shows top `n` results.


#### Histogram

`viz.hist(samples, [options])`

`viz.hist(dist, [options])`

*Options*:

- `numBins` (defaults to 30). For real-valued data, how many bins to aggregate data into.

#### Density plot

`viz.density(samples, [options])`

`viz.density(dist, [options])`

*Options*:

- `bounds` (default: min and max of the supplied samples). An array of bounds for density estimation

#### Heat map

`viz.heatMap(samples, [options])`

`viz.heatMap(dist, [options])`

*Options*:

- `bandwidthX` (TODO)
- `bandwidthY` (TODO)
- `boundsX` (TODO)
- `boundsY` (TODO)

#### Parallel coordinates

TODO

## Plotting distributions (complex)

More complex methods for visualizing smaples and distributions. These can plot data that are higher dimensional.

#### Marginals

`viz.marginals(dist)` shows each component of a joint distribution `dist` -- density plots for real components and histograms for categorical components.

#### Automatic visualization

`viz.auto` tries to automatically construct a useful visualization based on the types of the different components in the posterior.

*Options*:

- `summarize` (default = false). (TODO) For data with real-valued components, you can either try to show all the data (scatter plot) or summarize by showing a density estimate (heat map). This option has no effect if data is entirely categorical.

**How it works**

`viz.auto` uses the *types* of the components to constrain visualization.
Let's use `c` to denote categorical variables and `r` for real variables (for now, ordinal variables are treated as categorical). Some examples of types:

| Support element | Type                         | Notes                                              |
| --------------- | ---------------------------- | -------------------------------------------------- |
| String          | `c`                          |                                                    |
| Integer         | `c`                          |                                                    |
| Real number     | `r`                          |                                                    |
| Object          | concatenation of component types | The type of `{fruit: 'apple', price: 3.6}` is `rc` |
| Array           | concatenation of component types | The type of `[9.2, 8.1, 'candy bar']` is `rrc`     |


How each type is visualized:

| Type | Visualization |
|------|---------------|
| `c`| histogram |
| `r`| density plot |
| `cc`| frequency table |
| `cr`| density curve, colors for different categorical groups |
| `rr`| scatter plot (TODO| add heatmap) |
| `ccc`| trellis frequency table |
| `ccr`| trellis density plot, colors for different categorical groups |
| `crr`| trellis scatter plot (TODO| add trellis heatmap) |
| `rrr+` | parallel coordinates plot |
| `cccc`| trellis frequency table (TODO) |
| `cccr`| trellis scatter plot (TODO| add trellis heat map) |
| `ccrr`| trellis scatter plot / heat map (TODO) |
| `crrr`| trellis parallel coordinates plot (TODO) |
| `ccrrr`| trellis parallel coordinates plot (TODO) |

### Development notes

```sh
grunt setup-demo       # make webppl and webppl-editor dependencies for demo
grunt bundle           # compile js + minify, make css
grunt browserify       # compiling js
grunt uglify           # minify js
grunt browserify-watch # watchified compile js
grunt css              # make css
```
