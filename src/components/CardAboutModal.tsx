import React from 'react';
import { InfoPopup } from './InfoPopup';
import { useT } from '../i18n/useT';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function CardAboutModal({ visible, onClose }: Props) {
  const { t } = useT();
  return (
    <InfoPopup
      visible={visible}
      onClose={onClose}
      title={t('cards.aboutTitle')}
      lead={t('cards.aboutLead')}
      paragraphs={[t('cards.aboutSms'), t('cards.aboutHome')]}
    />
  );
}
