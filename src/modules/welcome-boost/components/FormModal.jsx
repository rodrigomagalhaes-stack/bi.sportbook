import { useState } from "react";
import { S } from "../styles";
import { IconClose } from "../icons";
import { toLocalInput } from "../lib/format";

// ─── FORM MODAL ──────────────────────────────────────────────────────────────
export default function FormModal({ onClose, onSave, loading, initial }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(() => initial ? {
    confronto: initial.confronto || "",
    id_jogo: initial.id_jogo || "",
    feito_por: initial.feito_por || "Neto",
    pedido_por: initial.pedido_por || "",
    data_evento: toLocalInput(initial.data_evento),
    data_welcome: toLocalInput(initial.data_welcome),
    odd_antiga: initial.odd_antiga != null ? String(initial.odd_antiga) : "",
    odd_nova: initial.odd_nova != null ? String(initial.odd_nova) : "",
    max_stake: initial.max_stake != null ? String(initial.max_stake) : "",
    mercado: initial.mercado || "",
    feito_em: toLocalInput(initial.feito_em),
  } : {
    confronto: "", id_jogo: "", feito_por: "Neto", pedido_por: "",
    data_evento: "", data_welcome: "", odd_antiga: "", odd_nova: "", max_stake: "", mercado: "",
    feito_em: "",
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.confronto || !form.id_jogo || !form.data_evento || !form.data_welcome || !form.odd_antiga || !form.odd_nova || !form.max_stake || !form.pedido_por) {
      alert("Preencha todos os campos.");
      return;
    }
    await onSave({
      ...form,
      odd_antiga: parseFloat(form.odd_antiga),
      odd_nova: parseFloat(form.odd_nova),
      max_stake: parseFloat(form.max_stake),
      data_evento: new Date(form.data_evento).toISOString(),
      data_welcome: new Date(form.data_welcome).toISOString(),
      feito_em: form.feito_em ? new Date(form.feito_em).toISOString() : null,
    });
  };

  const inputStyle = { ...S.input, width: "100%", boxSizing: "border-box" };

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal} className="modal">
        <div style={S.modalHeader} className="modal-header">
          <span style={S.modalTitle}>{isEdit ? "Editar Welcome Boost" : "Nova Welcome Boost"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer" }}>
            <IconClose />
          </button>
        </div>
        <div style={S.modalBody} className="modal-body">
          <div style={S.formGrid} className="form-grid">
            <div style={S.formGroupFull} className="form-group-full">
              <span style={S.label}>Confronto</span>
              <input style={inputStyle} placeholder="Ex: Brazil vs. Egypt" value={form.confronto} onChange={set("confronto")} />
            </div>
            <div style={S.formGroup}>
              <span style={S.label}>ID do Jogo</span>
              <input style={inputStyle} placeholder="Ex: 5024247122" value={form.id_jogo} onChange={set("id_jogo")} />
            </div>
            <div style={S.formGroup}>
              <span style={S.label}>Mercado</span>
              <input style={inputStyle} placeholder="Ex: Resultado Final, Over/Under..." value={form.mercado} onChange={set("mercado")} />
            </div>
            <div style={S.formGroup}>
              <span style={S.label}>Feito por</span>
              <select style={{ ...S.select, width: "100%", boxSizing: "border-box" }} value={form.feito_por} onChange={set("feito_por")}>
                <option>Neto</option>
                <option>Rodrigo</option>
                <option>Nouri</option>
              </select>
            </div>
            <div style={S.formGroupFull} className="form-group-full">
              <span style={S.label}>Pedido por</span>
              <input style={inputStyle} placeholder="Nome de quem solicitou" value={form.pedido_por} onChange={set("pedido_por")} />
            </div>
            <div style={S.formGroupFull} className="form-group-full">
              <span style={S.label}>Data e Hora do Evento</span>
              <input type="datetime-local" style={inputStyle} value={form.data_evento} onChange={set("data_evento")} />
            </div>
            <div style={S.formGroupFull} className="form-group-full">
              <span style={S.label}>Data e Hora da Welcome</span>
              <input type="datetime-local" style={inputStyle} value={form.data_welcome} onChange={set("data_welcome")} />
              <span style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>A partir de quando novos cadastros conseguem pegar a promoção (data do outro sistema).</span>
            </div>
            <div style={S.formGroupFull} className="form-group-full">
              <span style={S.label}>Feito em (data e horário)</span>
              <input type="datetime-local" style={inputStyle} value={form.feito_em} onChange={set("feito_em")} />
            </div>
            <div style={S.formGroup}>
              <span style={S.label}>Odd Antiga</span>
              <input style={inputStyle} type="number" step="0.01" placeholder="Ex: 1.80" value={form.odd_antiga} onChange={set("odd_antiga")} />
            </div>
            <div style={S.formGroup}>
              <span style={S.label}>Odd Nova (Boost)</span>
              <input style={inputStyle} type="number" step="0.01" placeholder="Ex: 2.00" value={form.odd_nova} onChange={set("odd_nova")} />
            </div>
            <div style={S.formGroupFull} className="form-group-full">
              <span style={S.label}>Max Stake (R$)</span>
              <input style={inputStyle} type="number" step="0.01" placeholder="Ex: 100.00" value={form.max_stake} onChange={set("max_stake")} />
            </div>
          </div>
          <button style={{ ...S.btnSubmit, opacity: loading ? 0.6 : 1 }} onClick={submit} disabled={loading}>
            {loading ? "Salvando..." : isEdit ? "Salvar Alterações" : "Cadastrar Boost"}
          </button>
        </div>
      </div>
    </div>
  );
}
