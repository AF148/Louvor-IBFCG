import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

// Sem isso o pipe `date` e o `toLocaleDateString` saem em inglês.
registerLocaleData(localePt, 'pt-BR');

// Inicializa a aplicação standalone, idioma pt-BR, rotas e infraestrutura Ionic.
bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    // O Firebase é inicializado de forma preguiçosa por
    // `src/app/core/firebase.ts` (SDK puro), não por providers aqui.
  ],
});
