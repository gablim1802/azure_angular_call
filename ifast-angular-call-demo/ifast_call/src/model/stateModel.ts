
export class StateModel {
  startCallDisableBoolean ?: boolean ;
  acceptCallDisableBoolean ?: boolean ;
  hangUpCallDisableButton ?: boolean ;
  muteCallDisableButton ?: boolean ;
  unmuteCallDisableButton ?: boolean ;
  connectedLabel ?: boolean;
  serverCallId ?: string;
  viewTarget : HTMLElement | null = null;
  remoteViewTarget : HTMLElement | null = null;
  translatedData : any = {
      original: '',
      translated: '',
  };

}
