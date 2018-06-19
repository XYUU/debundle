const acorn = require('acorn');
const fs = require('fs');
const path = require('path');
const escodegen = require('escodegen');
const { writeFile } = require('./writeToDisk');
const names = require("./ES6Object");

const bundleLocation = path.join("dist/");
const requirePath = path.join("dist/", "contexts/ES6Object");

listDir(bundleLocation).then(
    (files) => {
        files.forEach((filename) => {
            if (path.extname(filename) === '.js') {
                const bundleContents = fs.readFileSync(filename);
                let ast = acorn.parse(bundleContents, {});
                parse(ast, filename);
            }
        });
        console.log("完成", files.length);
    }
);



function readdirPromisify(dir) {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, (err, list) => {
            if (err) {
                reject(err);
            }
            resolve(list);
        });
    });
}

function statPromisify(dir) {
    return new Promise((resolve, reject) => {
        fs.stat(dir, (err, stats) => {
            if (err) {
                reject(err);
            }
            resolve(stats);
        });
    });
}

function listDir(dir) {
    return statPromisify(dir).then(stats => {
        if (stats.isDirectory()) {
            if (!dir.endsWith("node_modules")) {
                return readdirPromisify(dir).then(list =>
                    Promise.all(list.map(item =>
                        listDir(path.resolve(dir, item))
                    ))
                ).then(subtree => [].concat(...subtree));
            } else {
                return [];
            }
        } else {
            return [dir];
        }
    });
}

function parse(ast, filePath) {
    if (ast.type == 'Program') {
        let nodes = [], start = 0;
        ast.body.forEach((node, index) => {
            switch (node.type) {
                case 'VariableDeclaration':
                    {
                        let v = node.declarations.find((n) => isES6(n.id));
                        if (v) {
                            nodes.push(v.id.name);
                            if (!start) {
                                start = index;
                            }
                        }
                        break;
                    }
                case 'FunctionDeclaration':
                    {
                        let v = isES6(node.id);
                        if (v) {
                            nodes.push(v);
                            if (!start) {
                                start = index;
                            }
                        }
                        break;
                    }
                default:
                    break;
            }
        });
        if (nodes.length > 0) {
            let moduleLocation = path.relative(filePath, requirePath)
            ast.body.splice(start, nodes.length, buildVariableAssignment(nodes, moduleLocation));
            fs.unlinkSync(filePath);
            let code = escodegen.generate(ast, { format: { indent: { style: '  ' } } });
            writeFile(filePath, code);
            // console.log(code);
        }
    }
}

function isES6(node) {
    if (node.type === 'Identifier' && names[node.name]) {
        return node.name;
    }
}

function buildVariableAssignment(variables, moduleLocation) {
    const properties = variables.map((variable) => {
        return {
            "type": "Property",
            "method": false,
            "shorthand": true,
            "computed": false,
            "key": {
                "type": "Identifier",
                "name": variable
            },
            "kind": "init",
            "value": {
                "type": "Identifier",
                "name": variable
            }
        }
    });
    return {
        "type": "VariableDeclaration",
        "declarations": [{
            "type": "VariableDeclarator",
            "id": {
                "type": "ObjectPattern",
                "properties": properties
            },
            "init": {
                "type": "CallExpression",
                "callee": {
                    "type": "Identifier",
                    "name": "require"
                },
                "arguments": [{
                    "type": "Literal",
                    "value": moduleLocation
                }]
            }
        }],
        "kind": "var"
    };
}