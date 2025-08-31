/*
 * Copyright 2024, GeoSolutions Sas.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import { createPlugin } from "../../utils/PluginsUtils";
import HTML from '../../components/I18N/HTML';
import Text from '../../components/layout/Text';
// removed Jumbotron to avoid adding Bootstrap classes
import PropTypes from 'prop-types';
import src from '../../product/assets/img/pmi-banner.jpg';

/**
 * This plugin shows a main description in the homepage
 * @memberof plugins
 * @class
 * @name HomeDescription
 * @prop {string} className custom class name (default `ms-home-description`)
 * @prop {string} backgroundSrc background image source (default `assets/img/pmi-banner.jpg`)
 * @prop {string} descriptionFooterMessageId custom description message id (default none)
 * @prop {object} style inline style
 */
function HomeDescription({
    className,
    backgroundSrc,
    style,
    descriptionFooterMessageId
}) {
    return (
        <div
            style={{
                padding: 0,
                margin: 0,
                width: '100vw',
                marginLeft: 'calc(50% - 50vw)',
                marginRight: 'calc(50% - 50vw)',
                borderRadius: 0,
                backgroundColor: '#fff',
                ...style
            }}
        >
            {backgroundSrc
                ? <img
                    src={backgroundSrc}
                    alt=""
                    style={{ display: 'block', width: '100%', height: 'auto' }}
                />
                : null}
            {descriptionFooterMessageId
                ? <Text textAlign="center" classNames={['_relative']}>
                    <HTML msgId={descriptionFooterMessageId}/>
                </Text>
                : null}
        </div>
    );
}

HomeDescription.propTypes = {
    backgroundSrc: PropTypes.string,
    style: PropTypes.object,
    descriptionFooterMessageId: PropTypes.string,
    className: PropTypes.string
};

HomeDescription.defaultProps = {
    backgroundSrc: src,
    descriptionFooterMessageId: null,
    className: 'ms-home-description'
};

export default createPlugin('HomeDescription', {
    component: HomeDescription
});
