-- Decisão do João (10/11/2026): sem trava de sinal mínimo para confirmar reserva.
-- Com 0%, qualquer sinal > 0 confirma e a dispensa por PIN do Administrador deixa de ser pedida.
-- O parâmetro continua existindo: para voltar a exigir, basta subir o percentual.
update public.app_settings
   set min_signal_percent = 0,
       updated_at = now()
 where id;
