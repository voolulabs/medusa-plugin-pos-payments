# CONSTRAINTS.md — barreiras de qualidade do caminho de pagamento (não negociáveis)

Valem entre sessões e sobre qualquer diff. Mudar uma barreira exige errata datada
(ADR ou commit de docs que explique o porquê).

1. **Dinheiro nunca em float** — minor units (inteiros) + `MathBN`
   (`@medusajs/framework/utils`); conversão da unidade da adquirente documentada em
   um único lugar, com teste do caso de drift (`19.99 * 100 !== 1999`).
2. **Toda transição de estado do charge tem teste** — `ALLOWED_TRANSITIONS` +
   mutator único `transition(from, to)`; webhook e poll convergem no mesmo mutator.
3. **Zero `@ts-ignore`/`@ts-expect-error` em path de pagamento.**
4. **Falhar alto** — sem env/credencial o adapter não sobe (presence-gated); nunca
   degradar silenciosamente para outro provider.
5. **Options de adapter são aditivas por design** — nova chave opcional sim;
   renomear/remover = MAJOR (ADR 0006 §4).
6. **`data_version` no blob `data` desde o primeiro estado novo gravado por
   adapter** — o `data` é o contrato invisível que sobrevive a upgrades; sem
   versionamento nele, o 1.0.0 fica cego sobre o que há em produção.
7. **Nenhuma dependência nova em `dependencies` sem ADR que a justifique** (ADR 0001 §6).
8. **Credencial de adquirente nunca no repo/app/terminal** — env/constants no
   backend; gitleaks no CI é o filete de segurança, não a política.
