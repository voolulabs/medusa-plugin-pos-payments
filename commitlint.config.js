module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
    // corpo em PT-BR com caminhos/refs estoura 100 com frequencia
    "body-max-line-length": [2, "always", 200],
  },
};
