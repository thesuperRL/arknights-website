import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../translations';
import './UserGuidePage.css';

/** Set to true to show Free Operators in the special lists section */
const SHOW_FREE_OPERATORS = false;

const UserGuidePage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="user-guide-page">
      <div className="user-guide-header">
        <Link to="/" className="back-button">{t('userGuide.backToHome')}</Link>
        <h1>{t('userGuide.pageTitle')}</h1>
        <p className="user-guide-intro">
          {t('userGuide.intro')}
        </p>
      </div>

      <div className="user-guide-content">
        <section className="guide-section">
          <h2>{t('userGuide.gettingStartedTitle')}</h2>
          <h3>{t('userGuide.creatingAccountTitle')}</h3>
          <ol>
            <li>{t('userGuide.creatingAccountStep1')}</li>
            <li>{t('userGuide.creatingAccountStep2')}</li>
            <li>{t('userGuide.creatingAccountStep3')}</li>
            <li>{t('userGuide.creatingAccountStep4')}</li>
          </ol>
          <p>{t('userGuide.creatingAccountNote')}</p>

          <h3>{t('userGuide.loggingInTitle')}</h3>
          <ul>
            <li>{t('userGuide.loggingInItem1')}</li>
            <li>{t('userGuide.loggingInItem2')}</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.navTitle')}</h2>
          <p>{t('userGuide.navIntro')}</p>
          <ul>
            <li>{t('userGuide.navHome')}</li>
            <li>{t('userGuide.navTierLists')}</li>
            <li>{t('userGuide.navSynergies')}</li>
            <li>{t('userGuide.navAllOperators')}</li>
            <li>{t('userGuide.navTeamBuilderEtc')}</li>
            <li>{t('userGuide.navLoginRegister')}</li>
          </ul>
          <p>{t('userGuide.navFooter')}</p>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.quickRefTitle')}</h2>
          <div className="guide-table-wrap">
            <table className="guide-table">
              <thead>
                <tr>
                  <th>{t('userGuide.tableFeature')}</th>
                  <th>{t('userGuide.tableWhere')}</th>
                  <th>{t('userGuide.tableAccountNeeded')}</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>{t('userGuide.quickRefTierLists')}</td><td>{t('userGuide.quickRefWhereTierLists')}</td><td>{t('userGuide.quickRefNo')}</td></tr>
                <tr><td>{t('userGuide.quickRefSynergies')}</td><td>{t('userGuide.quickRefWhereSynergies')}</td><td>{t('userGuide.quickRefNo')}</td></tr>
                <tr><td>{t('userGuide.quickRefAllOps')}</td><td>{t('userGuide.quickRefWhereAllOps')}</td><td>{t('userGuide.quickRefNo')}</td></tr>
                <tr><td>{t('userGuide.quickRefOpDetail')}</td><td>{t('userGuide.quickRefWhereClickOp')}</td><td>{t('userGuide.quickRefNo')}</td></tr>
                <tr><td>{t('userGuide.quickRefLevelBadges')}</td><td>{t('userGuide.quickRefWhereNicheToggle')}</td><td>{t('userGuide.quickRefNo')}</td></tr>
                <tr><td>{t('userGuide.quickRefProfile')}</td><td>{t('userGuide.quickRefWhereProfile')}</td><td>{t('userGuide.quickRefYes')}</td></tr>
                <tr><td>{t('userGuide.quickRefTeamBuilder')}</td><td>{t('userGuide.quickRefWhereTB')}</td><td>{t('userGuide.quickRefYes')}</td></tr>
                <tr><td>{t('userGuide.quickRefIS')}</td><td>{t('userGuide.quickRefWhereIS')}</td><td>{t('userGuide.quickRefYes')}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.profileTitle')}</h2>
          <ul>
            <li>{t('userGuide.profileOpen')}</li>
            <li>{t('userGuide.profileOwned')}</li>
            <li>{t('userGuide.profileWantToUse')}</li>
            <li>{t('userGuide.profileSearchFilter')}</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.teamBuilderTitle')}</h2>
          <ul>
            <li><Link to="/team-builder">{t('nav.teamBuilder')}</Link> {t('userGuide.tbItem1')}</li>
            <li>{t('userGuide.tbItem2')}</li>
            <li>{t('userGuide.tbItem3')}</li>
            <li>{t('userGuide.tbItem4')}</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.isTitle')}</h2>
          <ul>
            <li><Link to="/integrated-strategies">{t('nav.integratedStrategies')}</Link> {t('userGuide.isItem1')}</li>
            <li>{t('userGuide.isItem2')}</li>
            <li>{t('userGuide.isItem3')}</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.languageTitle')}</h2>
          <p>{t('userGuide.languagePara')}</p>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.tierListsTitle')}</h2>
          <h3>{t('userGuide.browsingTitle')}</h3>
          <ol>
            <li>{t('userGuide.browseStep1')} <Link to="/tier-lists">{t('nav.tierLists')}</Link>{t('userGuide.browseStep1After')}</li>
            <li>{t('userGuide.browseStep2')}</li>
            <li>{t('userGuide.browseStep3')}</li>
            <li>{t('userGuide.browseStep4')}</li>
          </ol>

          <h3>{t('userGuide.howShownTitle')}</h3>
          <ul>
            <li>{t('userGuide.howShownPeak')}</li>
            <li>{t('userGuide.howShownNote')}</li>
          </ul>

          <h3>{t('userGuide.levelBadgesTitle')}</h3>
          <ul>
            <li>{t('userGuide.levelBadgesOff')}</li>
            <li>{t('userGuide.levelBadgesTurnOn')}</li>
            <li>{t('userGuide.levelBadgesWhenOn')}</li>
            <li>{t('userGuide.levelBadgesOverlay')}</li>
          </ul>

          <h3>{t('userGuide.otherDetailsTitle')}</h3>
          <ul>
            <li>{t('userGuide.relatedNiches')}</li>
            <li>{t('userGuide.ownedDistinct')}</li>
          </ul>

          <h3>{t('userGuide.specialListsTitle')}</h3>
          <ul>
            <li><Link to="/trash-operators">{t('tierLists.trashOperators')}</Link> — {(t('userGuide.specialTrash').split(' — ')[1] || t('userGuide.specialTrash'))}</li>
            {SHOW_FREE_OPERATORS && <li><Link to="/free-operators">{t('tierLists.freeOperators')}</Link> — {(t('userGuide.specialFree').split(' — ')[1] || t('userGuide.specialFree'))}</li>}
            <li><Link to="/global-range-operators">{t('tierLists.globalRange')}</Link> — {(t('userGuide.specialGlobal').split(' — ')[1] || t('userGuide.specialGlobal'))}</li>
            <li><Link to="/unconventional-niches-operators">{t('tierLists.unconventionalNiches')}</Link> — {(t('userGuide.specialUnconventional').split(' — ')[1] || t('userGuide.specialUnconventional'))}</li>
            <li><Link to="/low-rarity-operators">{t('tierLists.lowRarity')}</Link> — {(t('userGuide.specialLowRarity').split(' — ')[1] || t('userGuide.specialLowRarity'))}</li>
          </ul>
          <p>{t('userGuide.specialNote')}</p>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.synergiesTitle')}</h2>
          <h3>{t('userGuide.synergiesWhatTitle')}</h3>
          <p>{t('userGuide.synergiesWhatPara')}</p>
          <ul>
            <li>{t('userGuide.synergiesCore')}</li>
            <li>{t('userGuide.synergiesOptional')}</li>
          </ul>

          <h3>{t('userGuide.synergiesBrowsingTitle')}</h3>
          <ol>
            <li>{t('userGuide.synergiesBrowseStep1')} <Link to="/synergies">{t('nav.synergies')}</Link>{t('userGuide.synergiesBrowseStep1After')}</li>
            <li>{t('userGuide.synergiesBrowseStep2')}</li>
            <li>{t('userGuide.synergiesBrowseStep3')}</li>
          </ol>

          <h3>{t('userGuide.synergiesLevelTitle')}</h3>
          <ul>
            <li>{t('userGuide.synergiesLevelOff')}</li>
            <li>{t('userGuide.synergiesLevelTurnOn')}</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.allOpsTitle')}</h2>
          <ul>
            <li><Link to="/all-operators">{t('nav.allOperators')}</Link> {t('userGuide.allOpsItem1')}</li>
            <li>{t('userGuide.allOpsItem2')}</li>
            <li>{t('userGuide.allOpsItem3')}</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.operatorPageTitle')}</h2>
          <p>{t('userGuide.operatorPagePara')}</p>
          <ul>
            <li>{t('userGuide.operatorProfile')}</li>
            <li>{t('userGuide.operatorNiches')}</li>
            <li>{t('userGuide.operatorSynergies')}</li>
          </ul>
          <p>{t('userGuide.operatorPageNote')}</p>
        </section>

        <section className="guide-section">
          <h2>{t('userGuide.tipsTitle')}</h2>
          <ul>
            <li>{t('userGuide.tipsPeak')}</li>
            <li>{t('userGuide.tipsLevelBadges')}</li>
            <li>{t('userGuide.tipsProfileFirst')}</li>
            <li>{t('userGuide.tipsWantToUse')}</li>
          </ul>
          <p>{t('userGuide.tipsFeedback')}</p>
        </section>
      </div>
    </div>
  );
};

export default UserGuidePage;
