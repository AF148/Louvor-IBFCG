package com.igreja.scale;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Canal "lembretes" com IMPORTANCE_HIGH: a notificação da escala aparece
     * como banner no topo da tela (estilo WhatsApp) mesmo com o app fechado.
     * O canal padrão do plugin é IMPORTANCE_DEFAULT, que só vai para a barra.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel canal = new NotificationChannel(
                    "lembretes",
                    "Lembretes de escala",
                    NotificationManager.IMPORTANCE_HIGH);
            canal.setDescription("Avisos de escala do Louvor-IBFCG");
            NotificationManager gerenciador = getSystemService(NotificationManager.class);
            if (gerenciador != null) {
                gerenciador.createNotificationChannel(canal);
            }
        }
    }
}
